# grunt-file-dependencies

> Generates a list of files in dependency order.

This plugin will scan your source code for dependencies between files and generate an array of the file paths in dependency order. You can customize how it finds the dependencies and where it puts the file list.

You may want to use this plugin if the following applies to your project:

- The source code is separated into several source files (e.g. classes) that depend on each other and need to be loaded or combined in the correct order
- The source code is not using dynamic dependency loaders (like requirejs)
- The source code doesn't specify requirements in every file  
  \*_See the usage examples below for an example of how to detect dependencies without needing to specify requirements_
- You want to use a script tag injection plugin during development to keep your source files separate for easy debugging (e.g. [grunt-sails-linker](https://www.npmjs.com/package/grunt-sails-linker) but it has no clue about the file dependencies
- You want to use a concatenation plugin for a release build (e.g. [grunt-contrib-concat](https://www.npmjs.com/package/grunt-contrib-concat)) but it has no clue about the file dependencies

## Getting Started

This plugin requires Grunt `~0.4.5`

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install grunt-file-dependencies --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks("grunt-file-dependencies");
```

## The "file_dependencies" task

### Overview

In your project's Gruntfile, add a section named `file_dependencies` to the data object passed into `grunt.initConfig()`.

```js
grunt.initConfig({
  file_dependencies: {
    options: {
      // Task-specific options go here.
    },
    your_target: {
      // Target-specific file lists and/or options go here.
    }
  }
});
```

### Options

#### options.outputProperty,

Type: `String`  
Default value: `'ordered_files'` (on the current target)

The name of the grunt config property which will be assigned the array of ordered file paths. The default is to set the `ordered_files` property on the current target's configuration.

#### options.extractDefinesRegex

Type: `RegExp`  
Default value: `/define\s*\(\s*['"]([^'"]+)['"]/g`

A regular expression used to search each file for dependency definitions (e.g. class definitions).

#### options.extractRequiresRegex

Type: `RegExp`  
Default value: `/require\s*\(\s*['"]([^'"]+)['"]/g`

A regular expression used to search each file for dependency requirements (e.g. class requires).

#### options.extractDefines

Type: `Function`  
Default value: A function that returns the matches found by `extractDefinesRegex`  
Parameters:

- fileContent `String`: The content of the current file

Returns: `Array` of dependency names that are defined

A function that will process each file content to find the dependency definitions and return them as an array of their names. Use this if a regex will not work and you need something more custom.

#### options.extractRequires

Type: `Function`  
Default value: A function that returns the matches found by `extractRequiresRegex`  
Parameters:

- fileContent `String`: The content of the current file
- defineMap: `Object`: A mapping of dependency names to the file path where they are defined

Returns: `Array` of dependency names that are required

A function that will process each file content to find the dependency requirements and return them as an array of their names. Use this if a regex will not work and you need something more custom.

#### options.skipRequiredMyself

Type: `Boolean`
Default value: false

When this option is true, Ignore the file, which is required and defined.

#### options.forceMakeFileList

Type: `Boolean`
Default value: false

When this option is true, make file list even if there are cyclic.
Dependency files list has cyclic files at end of list.

#### options.cycleDotReport

Type: `String`
Default value: "CycleMap.dot"

When found cyclic, export cyclic defines and required as dot format.
This file are graphable by graphviz.

#### options.notFoundsReport

Type: `String`
Default value: "NotFounds.csv"

If there are not founds, rerpots as csv.

### Usage Examples

#### Default Options

Given a file `SuperClass.js` that defines a dependency:

```js
define("SuperClass", {});
```

and a file that depends on it `SubClass.js`:

```js
require("SuperClass");
define("SubClass", {
  /*...*/
});
```

The default options in the example below will find the dependency and set `file_dependencies.your_target.ordered_files` to `['src/SuperClass.js','src/SubClass.js']`.

```js
grunt.initConfig({
  file_dependencies: {
    options: {},
    your_target: {
      src: ["src/*.js"]
    }
  }
});
```

#### Custom Options

#####Specifying where the output is stored
The following example will store the ordered file path array in a custom configuration property and save it to a file as well:

```js
grunt.initConfig({
  file_dependencies: {
    your_target: {
      options: {
        outputProperty: "customtask.files.src"
      },
      files: {
        "tmp/files.json": ["src/*.js"]
      }
    }
  }
});
```

#####Detecting requirements using JSDoc style requires
Given a file `app/SuperClass.js` that defines a dependency:

```js
framework.define("app.SuperClass", {});
```

and a file that depends on it `app/SubClass.js`:

```js
/**
 * @requires app.SuperClass
 */
framework.define("app.SubClass", {
  /*...*/
});
```

Here is how you can use a regular expression to find the dependencies:

```js
grunt.initConfig({
  file_dependencies: {
    options: {
      extractDefinesRegex: /framework\.define\s*\(\s*['"]([^'"]+)['"]/g,
      extractRequiresRegex: /@requires\s*([\w.]*)/g
    },
    your_target: {
      src: ["app/*.js"]
    }
  }
});
```

#####Using ordered files for development
To inject your ordered file paths into an html file as script tags, send the output into an injection task (like [grunt-sails-linker](https://www.npmjs.com/package/grunt-sails-linker)):

```js
grunt.initConfig({
  file_dependencies: {
    your_target: {
      src: ["app/scripts/**/*.js"],
      options: {
        //push ordered files into sails-linker task
        outputProperty: "sails-linker.your_target.src"
      }
    }
  },
  "sails-linker": {
    your_target: {
      options: {
        appRoot: "app/"
      },
      src: [], //will be set by file_dependencies task
      dest: "app/index.html"
    }
  }
});
```

#####Using ordered files for release
To concatenate your source files into a single file in dependency order, send the output into a concatenation task (like [grunt-contrib-concat](https://github.com/gruntjs/grunt-contrib-concat)):

```js
grunt.initConfig({
  file_dependencies: {
    your_target: {
      src: ["app/scripts/**/*.js"]
    }
  },
  concat: {
    your_target: {
      //pull the ordered files from file_dependencies task
      src: ["<%= file_dependencies.your_target.ordered_files %>"],
      dest: "dist/built.js"
    }
  }
});
```

#####Detecting requirements by usage

An ideal use of this plugin is to detect dependencies automatically based on references without the need to explicitly list all of the requires. This is useful when using a simple inheritance framework (like [sooper](https://www.npmjs.com/package/sooper))

Given a file that defines a super class `app/src/SuperClass.js`:

```js
sooper.define("app.SuperClass", {
  value: 0,
  constructor: function(value) {
    this.value = value;
  }
});
```

and a file that defines a class that inherits SuperClass `app/src/TestClass.js`:

```js
sooper.define("app.TestClass", {
  inherits: app.SuperClass,
  constructor: function(value) {
    this.super(value);
    this.value++;
  }
});
```

and an app that uses TestClass `app/app.js`:

```js
var s = new app.SuperClass(42), //class reference using new
  T = app.TestClass, //cached class reference
  t1 = new T(1),
  t2 = new T(2);
```

Here is how you can find the dependencies:

```js
grunt.initConfig({
  file_dependencies: {
    options: {
      extractDefinesRegex: /sooper\.define\s*\(\s*['"]([^'"]+)['"]/g,
      extractRequires: function(fileContent, defineMap) {
        var requires = [];
        for (var name in defineMap) {
          if (fileContent.indexOf(name) != -1) requires.push(name);
        }
        return requires;
      }
    },
    your_target: {
      src: ["app/**/*.js"]
    }
  }
});
```

## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [Grunt](http://gruntjs.com/).

## Release History

[grunt-file-dependencies releases on GitHub](https://github.com/jonsquared/grunt-file-dependencies/releases)
