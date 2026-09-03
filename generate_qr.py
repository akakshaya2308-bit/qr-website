"""Small QR code generator CLI.

Usage:
  - Provide a URL (starts with http/https) or a username.
  - If a URL is provided it is encoded as-is.
  - If a username is provided, the script generates a unique payload
    combining the username and a UUID so each generated QR is unique.

Example:
  python generate_qr.py "https://example.com"
  python generate_qr.py alice
"""

import argparse
import os
import re
import uuid
import urllib.parse
from datetime import datetime

try:
    import qrcode
except Exception:
    qrcode = None


def generate_qr_code(data, file_name="qrcode.png", box_size=10, border=4, fill_color="black", back_color="white"):
    """Generate and save a QR image for `data`.

    Returns the absolute path to the saved file.
    """
    if qrcode is None:
        raise RuntimeError("qrcode module not available. Install dependencies: pip install -r requirements.txt")

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )

    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color=fill_color, back_color=back_color)

    # Ensure directory exists
    os.makedirs(os.path.dirname(file_name) or ".", exist_ok=True)
    img.save(file_name)
    return os.path.abspath(file_name)


def looks_like_url(s: str) -> bool:
    parsed = urllib.parse.urlparse(s)
    return parsed.scheme in ("http", "https") and parsed.netloc != ""


def safe_filename(name: str, max_len: int = 64) -> str:
    # Replace unsafe chars
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", name)
    if len(safe) > max_len:
        safe = safe[:max_len]
    return safe


def main():
    parser = argparse.ArgumentParser(description="Generate a QR code from a URL or username (unique per run).")
    parser.add_argument("input", nargs="?", help="URL or username to encode. If omitted, you'll be prompted.")
    parser.add_argument("--output-dir", default="qrcodes", help="Directory to save generated QR images.")
    parser.add_argument("--box-size", type=int, default=10, help="Box size for QR image.")
    parser.add_argument("--border", type=int, default=4, help="Border size (boxes) for QR image.")
    parser.add_argument("--fill-color", default="black", help="Color of the QR modules.")
    parser.add_argument("--back-color", default="white", help="Background color for the QR image.")
    args = parser.parse_args()

    user_input = args.input
    if not user_input:
        try:
            user_input = input("Paste a link or type a username: ").strip()
        except EOFError:
            print("No input provided. Exiting.")
            return

    if not user_input:
        print("Empty input. Nothing to encode.")
        return

    is_url = looks_like_url(user_input)

    if is_url:
        data_to_encode = user_input
        id_part = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        base_name = safe_filename(urllib.parse.urlparse(user_input).netloc)
    else:
        # Treat as username: append a UUID to ensure uniqueness
        unique_id = uuid.uuid4().hex
        data_to_encode = f"user:{user_input}|id:{unique_id}"
        id_part = unique_id[:8]
        base_name = safe_filename(user_input)

    # Build output filename
    file_name = f"{base_name}_{id_part}.png"
    out_path = os.path.join(args.output_dir, file_name)

    try:
        saved = generate_qr_code(
            data_to_encode,
            file_name=out_path,
            box_size=args.box_size,
            border=args.border,
            fill_color=args.fill_color,
            back_color=args.back_color,
        )

        print(f"Saved QR image: {saved}")
        print(f"Encoded payload: {data_to_encode}")
        if not is_url:
            print("Note: usernames are encoded together with a UUID to ensure uniqueness.")
    except Exception as exc:
        print(f"Failed to generate QR: {exc}")


if __name__ == "__main__":
    main()

