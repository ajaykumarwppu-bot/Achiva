# tests/visual — Screenshot CI (visual regression)

App ke **pixel-level** guards. Har push par GitHub Actions asli Chromium mein
app kholta hai, 6 screenshots leta hai, aur baseline se milata hai.

| View | Size | Themes |
|---|---|---|
| phone | 390×844 | light + dark |
| tablet | 768×1024 | light + dark |
| wide | 1440×900 | light + dark |

## Folders
- `baseline/` — approved screenshots (repo mein committed)
- `current/` — har CI run ke naye screenshots (gitignore-worthy, artifact mein jaate hain)
- `diff/` — fail hone par pixel-diff images

## Rules
- **Normal push** → capture + compare. `ALLOW` (default 20px) se zyada farq = **FAIL**.
- **Intentional design change** → commit message mein `[visual-update]` likho.
  CI baselines update karke khud commit kar dega (`[skip-visual]` tag ke saath,
  aur bot commits par job skip hota hai isliye koi loop nahi).
- Animations `reducedMotion: reduce` se OFF; external CDN requests BLOCK —
  isliye screenshots deterministic hain.
- Data seed JAAN-BOOJH kar nahi hota (empty-state = sabse stable baseline).
  Global CSS/leak detection ke liye ye kaafi hai.

## Locally chalana
```bash
npm install
npx playwright install chromium
npm run visual:update     # baselines banayein/badlein
npm run visual:capture    # current/ mein capture
npm run visual:compare    # current vs baseline
```

## Phone-purity guarantee
Phone/tablet ke baselines **tab hi badalne chahiye jab jaan-boojh kar phone
UI badla ho** (jo kabhi nahi badalna chahiye). Isliye phone screenshot ka
diff = red flag. Desktop design badalne par `[visual-update]` use karo aur
diff report mein confirm karo ki sirf `wide-*` PNGs badle hain, `phone-*` nahi.

<!-- visual-ci-proof: non-visual change -->
