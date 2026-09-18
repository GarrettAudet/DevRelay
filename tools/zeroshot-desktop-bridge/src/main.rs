//! Local experimental host for the unmodified, pinned Zeroshot engine.
//! Desktop tool calls belong to the active parent task, never this process.
use std::{any::Any, collections::BTreeMap, error::Error, fs::{self, OpenOptions},
    io::Write, path::{Path, PathBuf}, sync::Arc, time::{Duration, SystemTime, UNIX_EPOCH}};
use async_trait::async_trait;
use fs2::FileExt;
use openengine_cluster_protocol::{RunId, RunSubmission, Sha256Digest, WorkerOutcome};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use zeroshot_engine::{
    native_v2_admission::NativeV2Admission,
    native_v2_contract::NodeInvocation,
    native_v2_runner::{DriverControl, DriverInvocation, NativeNodeRunner, NodeDriver,
        NodeRole, NodeRunnerError, NodeSession, ResolvedEnvironment, SessionFactory, render_agent_prompt},
    native_v2_supervisor::{NativeV2Supervisor, RunEnvironment},
    v2_run_ledger::{CreateRun, RunLedger, sqlite::SqliteRunLedger},
};

const PROTOCOL: &str = "devrelay.zeroshot-desktop/1";
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
type Result<T> = std::result::Result<T, Box<dyn Error + Send + Sync>>;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Configuration {
    protocol: String,
    run_id: String,
    workspace: PathBuf,
    source_snapshot_digest: String,
    node_timeout_seconds: u64,
    submission: RunSubmission,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Response {
    protocol: String,
    request_digest: String,
    agent_id: String,
    plan_digest: String,
    response: Value,
}

fn digest(bytes: &[u8]) -> String { format!("sha256:{:x}", Sha256::digest(bytes)) }
fn is_digest(value: &str) -> bool {
    value.len() == 71 && value.starts_with("sha256:")
        && value[7..].bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
fn read_bounded(path: &Path) -> Result<Vec<u8>> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.len() > MAX_FILE_BYTES { return Err("invalid or oversized file".into()); }
    let bytes = fs::read(path)?;
    if bytes.len() as u64 > MAX_FILE_BYTES { return Err("oversized file".into()); }
    Ok(bytes)
}

// Hard-link publication makes a fully flushed file visible without replacing an
// earlier result. Repeated writes must be byte-identical. Local NTFS is required.
fn publish(path: &Path, bytes: &[u8]) -> Result<()> {
    if path.exists() {
        if read_bounded(path)? == bytes { return Ok(()); }
        return Err("immutable file conflict".into());
    }
    let temporary = path.with_extension(format!("{}.tmp", std::process::id()));
    let mut file = OpenOptions::new().write(true).create_new(true).open(&temporary)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    let linked = fs::hard_link(&temporary, path);
    fs::remove_file(&temporary)?;
    if let Err(error) = linked {
        if path.exists() && read_bounded(path)? == bytes { return Ok(()); }
        return Err(error.into());
    }
    Ok(())
}

struct DesktopSession;
#[async_trait]
impl NodeSession for DesktopSession {
    fn as_any(&self) -> &dyn Any { self }
    async fn is_live(&self) -> bool { true }
    async fn close(&self) {}
}
struct DesktopSessions;
#[async_trait]
impl SessionFactory for DesktopSessions {
    async fn open(&self, _: &NodeInvocation, _: &ResolvedEnvironment)
        -> std::result::Result<Arc<dyn NodeSession>, NodeRunnerError> {
        Ok(Arc::new(DesktopSession))
    }
}

struct DesktopDriver {
    queue: PathBuf,
    configuration_digest: String,
    workspace: PathBuf,
    timeout: Duration,
}

impl DesktopDriver {
    async fn exchange(&self, invocation: DriverInvocation, mut control: DriverControl)
        -> Result<WorkerOutcome> {
        let role = match invocation.role {
            NodeRole::Worker => "worker",
            NodeRole::Verifier => "verifier",
            NodeRole::GitDelivery => return Err("Desktop bridge does not grant Git delivery".into()),
        };
        let instructions = invocation.node.instructions.as_ref().ok_or("missing instructions")?;
        let prompt = render_agent_prompt(instructions, &invocation.node.input, &invocation.response)?;
        let request_id = invocation.node.reference.execution.to_string();
        let deadline = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis() as u64
            + self.timeout.as_millis() as u64;
        let request = json!({
            "protocol": PROTOCOL, "requestId": request_id, "configurationDigest": self.configuration_digest,
            "workspace": self.workspace, "reference": invocation.node.reference,
            "role": role, "binding": invocation.node.binding, "prompt": prompt,
            "responseContract": invocation.response, "deadlineUnixMs": deadline,
        });
        let bytes = serde_json::to_vec(&request)?;
        let request_digest = digest(&bytes);
        publish(&self.queue.join("requests").join(format!("{request_id}.json")), &bytes)?;
        println!("{}", json!({"event":"desktop_request", "requestId":request_id, "requestDigest":request_digest}));
        let response_path = self.queue.join("responses").join(format!("{request_id}.json"));
        let limit = tokio::time::Instant::now() + self.timeout;
        loop {
            if control.is_cancelled() { return Err(NodeRunnerError::Cancelled.into()); }
            if tokio::time::Instant::now() >= limit {
                publish(&self.queue.join("cancelled").join(format!("{request_id}.json")),
                    &serde_json::to_vec(&json!({"requestDigest":request_digest,"reason":"timeout"}))?)?;
                return Err("Desktop agent response timed out; reconcile the native agent before another run".into());
            }
            if response_path.exists() {
                let response: Response = serde_json::from_slice(&read_bounded(&response_path)?)?;
                if response.protocol != PROTOCOL || response.request_digest != request_digest
                    || response.agent_id.is_empty() || !is_digest(&response.plan_digest) {
                    return Err("Desktop response identity mismatch".into());
                }
                // The engine's NativeNodeRunner validates output types, verifier
                // signals and diagnostics against the actual admitted graph.
                return match invocation.role {
                    NodeRole::Worker => Ok(WorkerOutcome::Verified { output: response.response, artifacts: vec![] }),
                    NodeRole::Verifier => {
                        #[derive(Deserialize)]
                        #[serde(deny_unknown_fields)]
                        struct VerifierResponse { output: Value, signals: BTreeMap<openengine_cluster_protocol::FieldName,
                            openengine_cluster_protocol::EnumLabel>, diagnostic: Value }
                        let result: VerifierResponse = serde_json::from_value(response.response)?;
                        Ok(WorkerOutcome::Verifier { output: result.output, signals: result.signals,
                            diagnostic: result.diagnostic, artifacts: vec![] })
                    }
                    NodeRole::GitDelivery => Err("unsupported delivery".into()),
                };
            }
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_millis(250)) => {},
                _ = control.cancelled() => {
                    publish(&self.queue.join("cancelled").join(format!("{request_id}.json")),
                        &serde_json::to_vec(&json!({"requestDigest":request_digest,"reason":"cancelled"}))?)?;
                    return Err(NodeRunnerError::Cancelled.into());
                }
            }
        }
    }
}

#[async_trait]
impl NodeDriver for DesktopDriver {
    async fn run(&self, invocation: DriverInvocation, control: DriverControl)
        -> std::result::Result<WorkerOutcome, NodeRunnerError> {
        self.exchange(invocation, control).await.map_err(|error| NodeRunnerError::DriverDetail(error.to_string()))
    }
}

fn validate_configuration(configuration: &Configuration) -> Result<()> {
    if configuration.protocol != PROTOCOL || !is_digest(&configuration.source_snapshot_digest)
        || configuration.run_id.is_empty() || configuration.run_id.len() > 128
        || !(1..=7200).contains(&configuration.node_timeout_seconds)
        || !configuration.workspace.is_absolute() || !configuration.workspace.is_dir() {
        return Err("invalid Desktop bridge configuration".into());
    }
    let runtime = serde_json::to_value(&configuration.submission.runtime)?;
    if runtime["harness"] != "codex" || runtime["provider"] != "openai" {
        return Err("this bridge supports the inherited Codex Desktop executor only".into());
    }
    for binding in runtime["nodes"].as_object().ok_or("missing runtime nodes")?.values() {
        if binding["kind"] != "agent" || binding["model"] != "desktop-inherited"
            || binding.get("effort").is_some()
            || binding.get("sessionScope").is_some_and(|scope| scope != "execution")
            || binding.get("connections").is_some_and(|connections| connections != &json!({})) {
            return Err("unsupported binding: use inherited Desktop model, execution scope, no external connections".into());
        }
    }
    Ok(())
}

async fn execute() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 4 || !["validate", "run"].contains(&args[1].as_str()) {
        return Err("usage: devrelay-zeroshot-desktop <validate|run> <configuration.json> <queue-directory>".into());
    }
    let bytes = read_bounded(Path::new(&args[2]))?;
    let configuration: Configuration = serde_json::from_slice(&bytes)?;
    validate_configuration(&configuration)?;
    let configuration_digest = digest(&bytes);
    let submission_key = configuration.submission.submission_key.clone();
    let admitted = NativeV2Admission.admit(configuration.submission).await?;
    if args[1] == "validate" {
        println!("{}", json!({"valid":true,"engineRevision":"054ad3fd6c763b98d12f5b2e90830b97116561ad","configurationDigest":configuration_digest}));
        return Ok(());
    }
    let queue = PathBuf::from(&args[3]);
    fs::create_dir_all(&queue)?;
    let lock = OpenOptions::new().read(true).write(true).create(true).truncate(false).open(queue.join("engine.lock"))?;
    lock.try_lock_exclusive()?;
    for directory in ["requests", "responses", "cancelled", "claims", "plans", "receipts"] { fs::create_dir_all(queue.join(directory))?; }
    publish(&queue.join("configuration.json"), &bytes)?;
    let ledger = Arc::new(SqliteRunLedger::open(queue.join("run.sqlite3"))?);
    let run_id = RunId::new(configuration.run_id);
    ledger.create_or_get(CreateRun {
        run_id: run_id.clone(), submission_key,
        submission_digest: Sha256Digest::new(configuration_digest[7..].to_owned())?, admitted: admitted.clone(),
    }).await?;
    let environment = Arc::new(RunEnvironment::exact(&admitted.runtime, BTreeMap::new())?);
    let driver = Arc::new(DesktopDriver { queue: queue.clone(), configuration_digest,
        workspace: configuration.workspace, timeout: Duration::from_secs(configuration.node_timeout_seconds) });
    let runner = Arc::new(NativeNodeRunner::new(&admitted, driver, Arc::new(DesktopSessions))?);
    let supervisor = NativeV2Supervisor::new(run_id.clone(), ledger.clone(), runner, environment);
    let heartbeat_queue = queue.clone();
    let heartbeat = tokio::spawn(async move {
        loop {
            let temporary = heartbeat_queue.join("heartbeat.tmp");
            let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
            let bytes = serde_json::to_vec(&json!({"pid":std::process::id(),"lastSeenUnixMs":now})).unwrap();
            if fs::write(&temporary, bytes).is_err()
                || fs::rename(&temporary, heartbeat_queue.join("heartbeat.json")).is_err() { break; }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });
    let driving = supervisor.drive();
    tokio::pin!(driving);
    let result = tokio::select! {
        result = &mut driving => result?,
        signal = tokio::signal::ctrl_c() => {
            signal?;
            ledger.request_force_stop(&run_id).await?;
            driving.await?
        }
    };
    // The supervisor records terminal truth in SQLite first. This is a read-only
    // export of that fact, not a DevRelay acceptance or Gate promotion.
    let snapshot = ledger.get(&run_id).await?.ok_or("missing run")?;
    publish(&queue.join("terminal.json"), &serde_json::to_vec(&json!({"result": result, "snapshot": snapshot.snapshot}))?)?;
    heartbeat.abort();
    println!("{}", json!({"event":"terminal", "result":result}));
    Ok(())
}

#[tokio::main]
async fn main() {
    if let Err(error) = execute().await {
        eprintln!("Desktop bridge: {error}");
        std::process::exit(1);
    }
}
