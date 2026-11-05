# Rulebook fixtures (Task 8.2)

Deliberately small, deliberately boring: each file exists to exercise ONE failure mode of
the external-rulebook loader, and none of them carries genre tuning.

| file | what it proves |
| --- | --- |
| `valid.json` | a well-formed rulebook loads and its two scopes are read |
| `malformed.json` | truncated JSON is reported as `malformed-json`, not as "missing" |
| `wrong-schema.json` | a future schema version is refused by name |
| `unknown-parameter.json` | a misspelled parameter cannot reach a real control |
| `pinned.json` | a rulebook may not set a decision plan §16 locked (priority) |

The numeric values here are placeholders used as *values to write*, not as doctrine:
plan §9 defers genre tuning to later listening tests. `placeholder.json` in the app is the
rulebook that ships, and it is inert by design.
