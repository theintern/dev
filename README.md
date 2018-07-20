# intern-dev

Support scripts for Intern and its sub-projects

<br><p align="center">
<img src="https://cdn.rawgit.com/theintern/leadfoot/master/docs/logo.svg" alt="Leadfoot logo" height="90">
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp;
<img src="https://cdn.rawgit.com/theintern/intern/master/docs/logo.svg" alt="Intern logo" height="128">
&nbsp; &nbsp; &nbsp; &nbsp; &nbsp;
<img src="https://cdn.rawgit.com/theintern/digdug/master/docs/logo.svg" alt="Dig Dug logo" height="80">

</p></br>

## Usage

Include this project in `devDependencies` in your Intern component's
`package.json`, then add the desired scripts to `scripts` in `package.json`. For
example:

```js
"scripts": {
  "build": "intern-dev-build",
  "clean": "intern-dev-clean",
  "lint": "intern-dev-lint",
  "release": "intern-dev-release",
  "test": "intenr-dev-clean && intern-dev-build && intern-dev-test",
  "watch": "intern-dev-watch"
}
```

## Configuration

Components should generally try to follow the conventions used by this package
(standard tslint, sources in `src`, test config in `tests/intern.js`, etc.), in
which case no configuration is required. However, limited configuration is
supported through the `internDev` property in your project's `package.json`.

```js
"internDev": {
  // Patterns to ignore
  "ignore": [ "ignore", "glob", "patterns" ],
  "resources": {
    // Arrays of patterns to copy for a build, keyed by destination path
    "_build": [
      "patterns",
      { base: "src/stuff", pattern: "to" },
      "copy"
    ]
  },
  // Path to custom test config
  "testConfig": "tests/custom.config.js"
}
```

Note that all paths and path patterns are relative to the project root.
