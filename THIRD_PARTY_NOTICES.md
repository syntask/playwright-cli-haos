# Third-party notices

Playwright CLI for Home Assistant OS is licensed under the MIT License. See
[LICENSE](LICENSE).

The app image bundles third-party software. This file summarizes the licenses
and attribution requirements. The Docker image also contains the complete
upstream license texts under `/usr/share/licenses/playwright-cli/`.

## Microsoft Playwright

- Components: `@playwright/cli`, `playwright`, and `playwright-core`
- License: Apache License 2.0
- Source: <https://github.com/microsoft/playwright>
- CLI source: <https://github.com/microsoft/playwright-cli>

The upstream `NOTICE` file is reproduced below:

```text
Playwright
Copyright (c) Microsoft Corporation

This software contains code derived from the Puppeteer project (https://github.com/puppeteer/puppeteer),
available under the Apache 2.0 license (https://github.com/puppeteer/puppeteer/blob/master/LICENSE).
```

The full Apache License 2.0 and the additional third-party notices shipped with
Playwright are copied into the app image.

## Chromium

- Component: Chromium Headless Shell, installed by Playwright
- License: BSD 3-Clause and additional third-party licenses
- Source: <https://www.chromium.org/>

Chromium's license text and its bundled third-party notices are copied from the
installed browser bundle into the app image as `chromium-LICENSE.headless_shell`.

## ws

- License: MIT
- Source: <https://github.com/websockets/ws>

## ffmpeg

- Component: ffmpeg build installed by Playwright
- License: LGPL 2.1
- Source: <https://ffmpeg.org/>

The ffmpeg license text is copied into the app image as
`ffmpeg-COPYING.LGPLv2.1`.

## Base image and system packages

The app image is based on Debian and installs Debian packages including
`ca-certificates` and `fonts-liberation`. Their copyright and license files are
retained in the image under `/usr/share/doc/`.

## Trademarks

Playwright is a trademark of Microsoft Corporation. Chromium and Google are
trademarks of Google LLC. Home Assistant is a trademark of the Open Home
Foundation. This project is not affiliated with, sponsored by, or endorsed by
Microsoft, Google, or the Home Assistant project.
