# Context Pack Format

A context pack is one markdown file describing you. Slayply reads it in the browser (nothing is uploaded), gives every fact and story a stable ID, and uses those facts to ground your answers. See ADR-0007 for the reasoning.

## Example

```markdown
## Facts
- Built a billing service that handles 2M requests a day
- Led a team of 4 engineers
- Reduced p95 latency from 900ms to 200ms,
  mostly by adding a read-through cache

## Stories
### The Friday outage
The queue backed up. I added back-pressure and a dead-letter queue.

### The zero-downtime migration
Moved 40 tables without taking the app offline.

## Preferences
- location: Bengaluru or remote
- salary: INR 40L, negotiable

## Rules
- Never claim a degree I do not have
```

## Rules of the format
- Sections are headings of level 1 to 3 named `Facts`, `Stories`, `Preferences` (or `Prefs`) and `Rules`, in any case and any order. Other sections and text before the first heading are ignored.
- **Facts and Rules:** one bullet (`-`, `*`, `1.` or `1)`) per item. An indented line continues the item above.
- **Stories:** each deeper heading (`###`) under `Stories` starts one story; its text is the title plus the lines below it. Plain bullets also work, one story each.
- **Preferences:** bullets of `key: value`. The key ends at the first colon. A repeated key keeps the first value.
- Each item (and each preference value) is at most 2,000 characters, and a line over 10,000 characters is skipped. A `__proto__` preference is ignored. Closing hashes (`## Facts ##`) are allowed; a hash that is part of a title (`### Moved to C#`) is kept. A heading that names a known section always starts that section, even right after `# Stories`. Limits: 500 facts, 100 stories, 100 preferences, 100 rules. Items over a limit are skipped and reported.
- A line the parser cannot use is skipped and listed in the import preview with its line number.

## IDs
Facts become `F01`, `F02`, and so on; stories become `S01`, `S02`. Re-importing keeps the ID of any item whose text is unchanged (ignoring case and spacing), even if you moved it. A reworded item gets a new ID. An ID is never reused after its item is removed.

## What is sent to the model
Facts, stories and preferences are sent with a generation request, through the relay, to the provider you chose. **Rules are stored but not yet applied**, so they are not sent.
