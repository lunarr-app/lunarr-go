# Demo Content for App Store Review

Royalty-free demo content from the Blender Foundation (CC-BY licensed). No copyright risk.

## Included Films

| Film              | Year | License   |
| ----------------- | ---- | --------- |
| Big Buck Bunny    | 2008 | CC-BY     |
| Elephants Dream   | 2006 | CC-BY 3.0 |
| Sintel            | 2010 | CC-BY 3.0 |
| Tears of Steel    | 2012 | CC-BY 3.0 |
| Cosmos Laundromat | 2015 | CC-BY 3.0 |
| Sprite Fright     | 2021 | CC-BY 4.0 |

## Quick Start

```bash
# 1. Download demo content (~400MB)
npm run seed:demo

# 2. Start dev server
npm run dev

# 3. Visit /setup to create admin account

# 4. Create library:
#    - Name: Demo Movies
#    - Kind: Movie
#    - Path: /absolute/path/to/.lunarr/fixtures/demo/movies

# 5. Scan runs automatically — metadata populates from TMDb
```

## Troubleshooting

- **Download fails**: Check internet, try again. Existing files are skipped.
- **No metadata**: Configure TMDb API key in Settings.
