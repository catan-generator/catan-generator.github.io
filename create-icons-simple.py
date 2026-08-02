#!/usr/bin/env python3
"""
Create simple solid color PNG icons without dependencies
Uses pure Python to generate minimal PNG files
"""

import struct
import zlib

def create_simple_png(width, height, color_rgb, filename):
    """
    Create a simple solid color PNG file
    color_rgb: tuple like (45, 55, 72) for #2d3748
    """

    def png_chunk(chunk_type, data):
        chunk = chunk_type + data
        crc = zlib.crc32(chunk) & 0xffffffff
        return struct.pack("!I", len(data)) + chunk + struct.pack("!I", crc)

    # PNG header
    png_data = b'\x89PNG\r\n\x1a\n'

    # IHDR chunk (image header)
    ihdr_data = struct.pack("!2I5B", width, height, 8, 2, 0, 0, 0)
    png_data += png_chunk(b'IHDR', ihdr_data)

    # IDAT chunk (image data)
    raw_data = b''
    r, g, b = color_rgb
    for y in range(height):
        raw_data += b'\x00'  # No filter
        raw_data += bytes([r, g, b] * width)

    compressed_data = zlib.compress(raw_data, 9)
    png_data += png_chunk(b'IDAT', compressed_data)

    # IEND chunk (end)
    png_data += png_chunk(b'IEND', b'')

    with open(filename, 'wb') as f:
        f.write(png_data)

    print(f"✓ Created {filename} ({width}x{height})")

# Create icons with the app's theme color
theme_color = (45, 55, 72)  # #2d3748

create_simple_png(192, 192, theme_color, 'icon-192.png')
create_simple_png(512, 512, theme_color, 'icon-512.png')

print("\n✅ Basic PWA icons created!")
print("💡 For better icons, upload icon.svg to:")
print("   https://cloudconvert.com/svg-to-png")
print("   and replace these placeholder files.")

