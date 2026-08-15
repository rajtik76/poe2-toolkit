# Security Policy

## Reporting a vulnerability

Please report security issues privately through GitHub, not as a public issue:
open the repository's [Security tab](https://github.com/rajtik76/poe2-toolkit/security/advisories/new)
and use "Report a vulnerability". That opens a private thread visible only to
you and the maintainer.

Useful things to include: which package and version, what an attacker controls,
and the smallest input that reproduces it. A failing test or a malformed file
that triggers the bug is worth more than a long description.

This is a spare-time project, so expect a first reply within a week rather than
within hours. There is no bug bounty.

## What is worth reporting

These packages parse binary data that arrives over the network from GGG's patch
server, so the interesting surface is the decoding path:

- The DDS decoders (BC1, BC2, BC3, BC7) and the PNG writer in `@poe2-toolkit/ggpk`.
  Malformed or hostile image data reaching a decoder is the most plausible way to
  cause out-of-bounds reads, unbounded allocation or a hang.
- Bundle and table decoding, including the on-disk bundle cache in
  `@poe2-toolkit/ggpk`, and the `.psg` graph parser in `@poe2-toolkit/tree-extractor`.
- The extractor CLIs, which write files to a caller-supplied output directory.
  Anything that lets crafted input escape that directory counts.

Dependency vulnerabilities that are actually reachable from this code are also
in scope; please say how they are reached.

## What is not in scope

- GGG's own servers and game data. This project only reads from them. Report
  problems there to Grinding Gear Games.
- Denial of service against the patch CDN, or anything that involves sending
  traffic to GGG's infrastructure.
- The demo application at poe.rajtik.com, which is a separate project and not
  part of this repository.
- Reports that require an attacker to already control the machine running the
  extraction, or to have replaced the packages themselves.

## Supported versions

Only the current release line of each package receives fixes. All packages are
on 1.x, and fixes land in a new patch release rather than being backported to
older versions.
