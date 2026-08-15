# Contributing

Thanks for taking an interest. This is a small project, so there is no process
to speak of: open an issue if you want to discuss something first, or just send
a pull request.

## The one hard rule: no game data

Nothing derived from Path of Exile 2 belongs in this repository. Not data, not
art, not test fixtures, not hashes of either. Every extractor reads from the
official patch server at run time and hands the result back to the caller.

That is deliberate and it is the whole reason the project can exist as a set of
libraries rather than yet another app shipping a stale snapshot. A pull request
that commits extracted output, however small or convenient, cannot be merged.
`.ggpk-extract/` and `.golden-fixtures/` are gitignored for this reason.

## Getting set up

Node 18 or newer. The packages are ESM only.

```sh
npm install        # links all workspaces
npm run build      # builds in dependency order
```

Unit tests run with no game data at all:

```sh
npm test
```

The characterization and 1:1 verification suites need a local extract and golden
fixtures. Generating them takes about a minute and roughly a gigabyte of disk:

```sh
npm run build
npm run fixtures:extract
npm run fixtures:bless
```

See [docs/GOLDEN_FIXTURES.md](docs/GOLDEN_FIXTURES.md) for what those do and what
they cost. Suites that need fixtures skip themselves when the fixtures are
absent, which is also why CI never runs them.

## Before you commit

Run the full gate. It is what CI runs, and it is cheap:

```sh
npm run ci
```

That covers build, typecheck, lint, the README package-table check and tests with
coverage. Coverage thresholds are enforced per package, so a new file with no
tests will fail the build rather than quietly lower the bar.

## How the packages fit together

Worth knowing before you put code somewhere:

- `ggpk` is the only package that touches the network. If you find yourself
  adding a fetch anywhere else, it probably belongs behind `GgpkSource`.
- Extractors take a `GgpkSource` and return typed data. They do no I/O of their
  own and never write to disk; their CLIs do that.
- `tree-core` is headless and dependency free. Geometry in, positioned scene out,
  no rendering concerns.
- `tree-react` draws what the core computed and owns pan, zoom and clicks. Engine
  logic does not belong here.

Each package has its own README describing its contract in detail.

## Commits and releases

Commit messages follow Conventional Commits, scoped by package where it makes
sense: `fix(ggpk): ...`, `feat(item-extractor): ...`, `docs: ...`.

Releases are per package, not repo wide. Before tagging one, write up the changes
since that package's last release tag in `packages/<pkg>/CHANGELOG.md` and commit
it together with the version bump. The tag has to point at a commit that already
carries the finished changelog, because the release snapshot freezes the moment
the tag is pushed. Tags are named `<package>-v<version>`, for example
`tree-react-v1.0.0`.

## License

By contributing you agree that your work is licensed under the MIT License, the
same as the rest of the project.
