"""
Non-interactive wrapper — runs test_flow.py end-to-end without pauses.
Patches the pause() function to auto-proceed and captures all output.
"""
import sys
import io

# Patch input() to auto-proceed (no user input needed)
import builtins
_original_input = builtins.input
def _auto_input(prompt=""):
    print(f"  ⏸ {prompt.strip()} [AUTO]")
    return ""
builtins.input = _auto_input

# Now import and run
from test_flow import main

if __name__ == "__main__":
    main()
