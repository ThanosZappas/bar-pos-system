# Design tokens — Negroni Bar Lab

Single source of truth for the visual identity. Extracted on 2026-11-08 from the
inline CSS of https://www.barlab.gr/menu.html (the identity chosen for the apps).
Android (`android/app/src/main/java/gr/barlab/negroni/ui/theme/`) and the web
dashboard (`web/src/styles/tokens.css`) copy these values by hand; change both
when this file changes.

## Colors

| Token            | Hex       | Source selector on menu.html           | Use in apps                       |
|------------------|-----------|----------------------------------------|-----------------------------------|
| `bg`             | `#111008` | `body` background                      | App/page background               |
| `surface`        | `#000000` @ 70% | `nav` background `rgba(0,0,0,0.7)` | Top bars                          |
| `text`           | `#e8dfc8` | `body` color, `.item-name`             | Primary text                      |
| `gold`           | `#c9a84c` | `.hero-logo`, `.item-price`, active tab | Primary/accent, prices, focus    |
| `gold-tint`      | `#c9a84c` @ 8% | `.tab-btn.active` background      | Selected chip/tab background      |
| `desc`           | `#b8954a` | `.item-desc`                           | Secondary text, descriptions      |
| `muted`          | `#8a7a5a` | `.hero-sub`, `.tab-btn`, footer links  | Tertiary text, inactive tabs      |
| `muted-2`        | `#6a5f45` | `.spirit-cat`                          | Labels                            |
| `faint`          | `#5a4f35` | `.note`, `footer`                      | Hints, disabled                   |
| `soft-text`      | `#c8bea8` | `.spirit-name`                         | Body text on cards                |
| `line`           | `#2a2416` | nav/hero/footer borders, `.cat-line span` | Dividers, card borders         |
| `line-strong`    | `#4a3f25` | `.tab-btn` border                      | Outlined controls                 |
| `line-faint`     | `#1e1a0f` | `.item` bottom border                  | List row separators               |
| `green`          | `#6a9a6a` | `.badge-na`                            | Status: Paid                      |
| `rust`           | `#9a5a3a` | `.badge-str`                           | Status: Partially paid            |
| `slate`          | `#6a7a9a` | `.badge-sig`                           | Status: Served                    |
| `error`          | `#ed3c0d` | home page `style.css` (only red on the site) | Errors, edited/cancelled highlight |

Table status colors: Free = `line-strong` outline, Preparing = `gold`,
Served = `slate`, Partially paid = `rust`, Paid = `green`.

## Typography (all SIL Open Font License 1.1 — bundled, see `design/fonts/`)

| Role             | Family            | Weight | Size  | Extras                                   |
|------------------|-------------------|--------|-------|------------------------------------------|
| Body             | Lato              | 300    | 13.5px | line-height 1.6, letter-spacing .3px (`.item-desc`) |
| Body emphasis / buttons | Lato       | 400    | 11px  | uppercase, letter-spacing 2px (`.tab-btn`) |
| Item name / price | Playfair Display | 400    | 15px  | (`.item-name`, `.item-price`)            |
| Section label    | Playfair Display  | 400    | 11px  | uppercase, letter-spacing 3px (`.cat-line p`) |
| Overline         | Lato              | 300    | 11px  | uppercase, letter-spacing 4px (`.hero-sub`) |
| Logo             | Dancing Script    | 600    | 28px nav / 52px hero (38px ≤520px) | line-height 1 |
| Icon wordmark    | Playfair Display  | 700    | —     | Bold serif required by the icon brief    |

Large-text variants (dashboard order board) scale these sizes up; the families
and letter-spacing stay the same.

## Spacing and shape

- Borders are hairlines: `0.5px` (use 1px / `Dp.Hairline` where 0.5 is not renderable).
- No border radius anywhere on the site → corners are square (radius 0; 2dp max for touch feedback).
- Nav: padding `18px 40px` (≤520px: `14px 20px`); links gap `28px` (≤520px: `16px`).
- Hero: padding `60px 20px 40px`; divider `max-width 280px`, margin `18px auto`, gap `12px`.
- Tabs: gap `8px`, padding `8px 22px` (≤520px: `7px 14px`), wrap padding `30px 20px 0`, max-width `800px`.
- Content: max-width `720px`, padding `30px 24px 60px`.
- Category line: margin `2rem 0 1rem` (32px / 16px), gap `12px`.
- List item: padding `11px 0`, price margin-left `20px`; description margin-top `4px`.
- Cards (`.spirit-card`): padding `12px 14px`, grid gap `8px`.
- Badge: padding `2px 8px`, font 9px, letter-spacing 1px, uppercase, 0.5px border in currentColor.
- Footer: padding `30px 20px`.

Spacing scale derived from the above (dp/px): 4, 8, 12, 16, 20, 24, 32, 40, 60.

## Greek letters

Lato and Playfair Display have no Greek glyphs. Greek (the Greek UI and Greek menu entries) comes
from matching fonts, letter by letter, while Latin keeps the site's fonts:

| Site font        | Greek from           | Why |
|------------------|----------------------|-----|
| Lato 300/400/700 | Commissioner 300/400/700 | Humanist sans with the same x-height as Lato (0.50 em) and a similar light colour |
| Playfair Display 400/700 | Noto Serif Display 400/700 | Upright high-contrast display serif like Playfair (GFS Didot's Greek is more calligraphic) |

The Greek fonts are Greek-only subsets (U+0370–03FF, about 15–20 KB each) served by Google Fonts'
text subsetting; both are SIL OFL 1.1 without Reserved Font Names. Android combines them with
`Typeface.CustomFallbackBuilder` (`ui/theme/Type.kt`), the dashboard with `unicode-range`
(`web/src/styles/tokens.css`). Dancing Script (wordmark) is Latin-only. The site's own fonts are
bundled unmodified, as their Reserved Font Name clause requires; licences are in `design/fonts/`.

## Profile icons

Sixteen line drawings in `design/icons/profile-icons.json` (24×24, stroke 1.4, round caps and
joins, no fill), drawn in `gold` inside a square hairline frame (`line-strong`; `gold` when
selected), like the site's square, hairline style. Role defaults: `person` (server), `barman`
(bow tie), `admin` (key). Uploaded pictures fill the same square frame, cropped to the centre.
