# Third-Party Notices

This project is licensed under the MIT License. The following direct dependencies are recorded in the committed `package-lock.json` and are relevant to building or running the project.

## Three.js

- Package: `three`
- Locked version: `0.179.1`
- Role: runtime 3D rendering dependency; its code is included in the production JavaScript bundle
- License: MIT

## Vite

- Package: `vite`
- Locked version: `7.3.6`
- Role: development and production build tooling
- License: MIT

## Dependency lockfile

`package-lock.json` also records Vite's transitive build dependencies and their package-level license metadata. They are not listed individually here because they are transitive build dependencies rather than direct application dependencies. The lockfile remains the authoritative record of the exact dependency graph used by this project.
