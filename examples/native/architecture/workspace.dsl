workspace "Authentication architecture" "Deterministic DevRelay conformance fixture" {
    model {
        user = person "Registered user"
        system = softwareSystem "Authentication system"
        user -> system "Authenticates"
    }
    views {
        systemContext system "AuthenticationContext" {
            include *
            autoLayout
        }
    }
}
