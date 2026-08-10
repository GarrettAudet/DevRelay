# WorkItemVerification proposal

Add one provider-neutral WorkItemVerification module that independently evaluates one exact WorkExecution result against the approved WorkItem verification plan and required evidence. Verifier adapters produce evidence only; Core validates it, WorkItemVerificationGate owns approval, and ChangeIntegration remains downstream.
