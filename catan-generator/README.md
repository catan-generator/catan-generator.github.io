# Catan Map Generator

Modern seed-based Catan board generator.

## Start
```bash
python3 -m http.server 3000
```
Open: **http://localhost:3000**

## Features
- 19 large hexagons (3-4-5-4-3 layout, optimized for mobile)
- **Classic Catan icons**: Detailed illustrations (trees, bricks, sheep, wheat, mountains, cactus)
- Seed system (reproducible boards)
- **Classic preset**: Original Catan rules - red numbers (6 & 8) and same resources can't be adjacent
- **Custom preset**: Full control over placement rules
- Modern dark theme
- Mobile responsive (board shows first, no scrolling needed)

## Game Rules (Classic Mode)
- **Red Numbers Rule**: The most productive numbers (6 and 8) cannot be adjacent - this is automatically enforced
- Same resource types cannot be adjacent
- Advanced algorithm with up to 50,000 attempts to find valid board configurations

## Cache
If background looks black: Hard refresh `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)

MIT License

