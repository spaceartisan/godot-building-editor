# 1.2.3 numeric input cleanup

Twelve web placement controls now share finite-number, range and optional integer guards. Invalid input restores the previous value and explains the allowed range. Existing objects and undo history are untouched. Marker placement already had a finite/range guard and remains unchanged.

CLI preview rejects blank numeric arguments before optional dependency loading. Explicit zero yaw remains valid. Existing command names and exit-code meanings are preserved.

Regression coverage extends the existing validation-feedback and CLI suites: valid boundaries, negative elevations, invalid input restoration, untouched document/history, whitespace CLI arguments, and zero yaw. The final release report records the executed source snapshot and gates. DOM-adapter coverage does not establish browser layout; Godot 4.7 remains unverified.

Scene generation, separate lighting shells, supplied blueprints and generated scene assets are unchanged.
