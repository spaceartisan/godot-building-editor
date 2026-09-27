# 1.2.4 local server startup cleanup

The local web server validates PORT before listening and reports configuration errors with exit 2. Port conflicts and other listen errors exit 3 with concise diagnostics. An occupied port includes a Linux command showing how to choose another port. Unset PORT still means 5173; explicit 0 retains ephemeral-port support. Loopback binding and HTTP routes are unchanged.

Infrastructure coverage includes blank, whitespace, malformed, negative, fractional and oversized ports, a real occupied-port conflict, ephemeral startup, and continued successful HTTP requests. The release report records executed gates and dependency versions. No geometry, blueprint or exporter changes are included. Browser layout and Godot 4.7 remain unverified.
