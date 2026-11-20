"""Generate fresh local secrets once, preserving any existing configuration."""

from pathlib import Path
import secrets

root = Path(__file__).resolve().parent
content = (
    (root / ".env.example")
    .read_text()
    .replace("GENERATE_JWT", secrets.token_hex(32))
    .replace("GENERATE_DB", secrets.token_hex(24))
)
try:
    with (root / ".env").open("x") as output:
        output.write(content)
    print("Created .env. Set AI_API_KEY before starting a live interview.")
except FileExistsError:
    print(".env already exists. Existing settings were preserved.")
