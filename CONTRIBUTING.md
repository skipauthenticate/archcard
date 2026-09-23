# Contributing

Thanks for taking a look. Small fixes are welcome, especially for a repository layout that the map misses.

For a scanner fix, include a small example of the layout that failed. Add one test that shows the expected map data or SVG output. Run `node --test` before opening a pull request.

Keep the map tied to what the source shows. Labels must come from files and folders that the tool can name. Please do not add guessed services or runtime behavior.

The scanner is in `src/analyze.js`; the SVG renderer is in `src/render.js`. Keep scanner changes separate from visual changes when you can. This makes review easier.

To run the tool from source:

```bash
git clone https://github.com/skipauthenticate/archcard.git
cd archcard
node --test
node bin/archcard.js /path/to/your-repo
```
