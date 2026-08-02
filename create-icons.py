#!/usr/bin/env python3
"""
Simple script to create placeholder PNG icons for PWA
Uses PIL/Pillow to create basic icons
"""

try:
    from PIL import Image, ImageDraw, ImageFont
    import math

    def create_icon(size, filename):
        # Create image with dark background
        img = Image.new('RGB', (size, size), '#2d3748')
        draw = ImageDraw.Draw(img)

        # Draw hexagon
        center_x, center_y = size // 2, size // 2
        radius = size // 3

        hexagon_points = []
        for i in range(6):
            angle = math.pi / 3 * i - math.pi / 6
            x = center_x + radius * math.cos(angle)
            y = center_y + radius * math.sin(angle)
            hexagon_points.append((x, y))

        # Draw filled hexagon
        draw.polygon(hexagon_points, fill='#4299e1', outline='#3182ce')

        # Draw number token (circle)
        token_radius = size // 8
        draw.ellipse([
            center_x - token_radius,
            center_y - token_radius,
            center_x + token_radius,
            center_y + token_radius
        ], fill='#c1121f', outline='#f7fafc')

        # Draw number
        try:
            font_size = size // 6
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
        except:
            font = ImageFont.load_default()

        text = "8"
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        text_x = center_x - text_width // 2
        text_y = center_y - text_height // 2

        draw.text((text_x, text_y), text, fill='#f7fafc', font=font)

        # Save
        img.save(filename, 'PNG')
        print(f"✓ Created {filename} ({size}x{size})")

    # Create both sizes
    create_icon(192, 'icon-192.png')
    create_icon(512, 'icon-512.png')
    print("\n✅ PWA icons created successfully!")
    print("Your app is now ready to be installed on mobile devices!")

except ImportError:
    print("❌ Pillow not installed. Install with:")
    print("   pip3 install Pillow")
    print("\nOr use online converter:")
    print("   https://cloudconvert.com/svg-to-png")
    print("   - Upload icon.svg")
    print("   - Convert to 192x192 → save as icon-192.png")
    print("   - Convert to 512x512 → save as icon-512.png")

