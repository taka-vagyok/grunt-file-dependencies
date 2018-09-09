/*
 * grunt-file-dependencies
 *
 *
 * Copyright (c) 2014 Jon E. John
 * Licensed under the MIT license.
 */

"use strict";

module.exports = function(grunt) {
  grunt.registerMultiTask(
    "file_dependencies",
    "Generate a list of files in dependency order.",
    function() {
      function extractMatches(fileContent, regex) {
        var matches = [],
          match;
        while ((match = regex.exec(fileContent))) {
          matches.push(match[1]);
        }
        // remove duplicates
        return matches.filter(function(x, i, self) {
          return self.indexOf(x) === i;
        });
      }

      var options = this.options({
        outputProperty: this.name + "." + this.target + "." + "ordered_files",
        extractDefines: function(fileContent) {
          return extractMatches(fileContent, options.extractDefinesRegex);
        },
        extractRequires: function(fileContent, defineMap) {
          return extractMatches(fileContent, options.extractRequiresRegex);
        },
        extractDefinesRegex: /define\s*\(\s*['"]([^'"]+)['"]/g,
        extractRequiresRegex: /require\s*\(\s*['"]([^'"]+)['"]/g,
        skipRequiredMyself: false,
        forceMakeFileList: false,
        cycleDotReport: "CycleMap.dot",
        notFoundReport: "NotFounds.csv"
      });

      var orderedFiles = getOrderedFiles(this.filesSrc);
      writeOutput(this.files, orderedFiles, options);

      function findNextFiles(fdm) {
        var nextFiles = [];
        for (var file in fdm) {
          if (hasRequiresInMap(fdm[file].requires, fdm)) {
            continue;
          }
          nextFiles.push(file);
          delete fdm[file];
        }
        return nextFiles;
      }

      function getOrderedFiles(files) {
        var orderedFiles = [],
          fdm = getFileDependencyMapFromFiles(files);
        while (Object.keys(fdm).length) {
          var nextFiles = findNextFiles(fdm);
          if (nextFiles.length === 0) {
            deleteIfNotLinkedFile(fdm);
            if (options.forceMakeFileList === true) {
              mkDot(fdm);
              for (var file in fdm) {
                nextFiles.push(file);
                delete fdm[file];
              }
            } else {
              logCyclicDependencyError(fdm);
            }
            break;
          }
          orderedFiles.push.apply(orderedFiles, nextFiles);
        }
        return orderedFiles;
      }

      function getFileDependencyMapFromFiles(files) {
        var fileInfos = expandFileInfo(getExistingFiles(files)),
          defineMap;
        expandFileInfoDefines(fileInfos);
        defineMap = createDefineToFileMap(fileInfos);
        expandFileInfoRequires(fileInfos, defineMap);
        return createFileDependencyMap(fileInfos, defineMap);
      }

      function getExistingFiles(files) {
        var existingFiles = [];
        files.forEach(function(filepath) {
          if (!grunt.file.exists(filepath))
            grunt.log.warn('Source file "' + filepath + '" not found.');
          else existingFiles.push(filepath);
        });
        return existingFiles;
      }

      function expandFileInfo(files) {
        return files.map(function(file) {
          var fileContent = grunt.file.read(file);
          return {
            path: file,
            content: fileContent
          };
        });
      }

      function expandFileInfoDefines(fileInfos) {
        fileInfos.forEach(function(fileInfo) {
          fileInfo.defines = options.extractDefines(fileInfo.content);
        });
      }

      function createDefineToFileMap(fileInfos) {
        var map = {};
        fileInfos.forEach(function(fileInfo) {
          fileInfo.defines.forEach(function(define) {
            map[define] = fileInfo.path;
          });
        });
        return map;
      }

      function expandFileInfoRequires(fileInfos, defineMap) {
        fileInfos.forEach(function(fileInfo) {
          fileInfo.requires = options.extractRequires(
            fileInfo.content,
            defineMap
          );
        });
      }

      function createFileDependencyMap(fileInfos, defineMap) {
        var fdm = {};
        var notFounds = {};
        fileInfos.forEach(function(fileInfo) {
          var fpath = fileInfo.path;
          if (fileInfo.defines.length === 0) {
            fileInfo.defines.push("---");
          }
          // resolved requires
          var resolves = {};
          fileInfo.requires.forEach(function(req) {
            var file = defineMap[req];
            if (file) {
              if (options.skipRequiredMyself === false) {
                resolves[file] = req;
              } else if (file !== fpath) {
                resolves[file] = req;
              }
            } else if (notFounds[req]) {
              notFounds[req].push(fpath);
            } else {
              notFounds[req] = [fpath];
            }
          });
          fdm[fpath] = {
            defines: fileInfo.defines,
            requires: resolves
          };
        });
        if (Object.keys(notFounds).length !== 0) {
          exportNotFounds(notFounds, options.notFoundReport);
          warnNotFoundRequires(notFounds);
        }
        return fdm;
      }

      function exportNotFounds(notFounds, exportfile) {
        var fs = require("fs");
        var ofd = fs.openSync(exportfile, "w");
        fs.writeSync(ofd, "required, files...\n");
        Object.keys(notFounds).forEach(function(req) {
          fs.writeSync(ofd, req);
          notFounds[req].forEach(function(path) {
            fs.writeSync(ofd, "," + path);
          });
          fs.writeSync(ofd, "\n");
        });
        fs.close(ofd, function(err) {
          console.log(err);
        });
      }

      function warnNotFoundRequires(notFounds) {
        Object.keys(notFounds).forEach(function(req) {
          var msg = 'Not found "' + req + '". ';
          if (notFounds[req].length > 1) {
            msg += "Required files:";
            notFounds[req].forEach(function(path) {
              msg += "\n  " + path + "";
            });
          } else {
            msg += "Required file:\n  " + notFounds[req][0];
          }
          warn(msg);
        });
      }

      function hasRequiresInMap(requires, map) {
        for (var require in requires) {
          if (require in map) {
            return true;
          }
        }
        return false;
      }

      function warn(message) {
        grunt.log.writeln("WARNING"["yellow"].bold + ": " + message["yellow"]);
      }

      function mkDot(exportfile, fdm) {
        var nodes = [];
        var fs = require("fs");
        var ofd = fs.openSync(exportfile, "w");
        var clusternum = 0;
        fs.writeSync(ofd, "digraph dependency {\n");
        fs.writeSync(ofd, "\trankdir=LR;\n");
        // write nodes with file cluster
        for (var file in fdm) {
          clusternum += 1;
          var cname = "cluster_" + clusternum;
          fs.writeSync(ofd, "\tsubgraph " + cname + " {\n");
          fs.writeSync(ofd, "\t\trankdir=TB;\n");
          for (var df in fdm[file].defines) {
            var name = fdm[file].defines[df];
            nodes.push(name);
            fs.writeSync(ofd, '\t\t"' + name + '";\n');
          }
          fs.writeSync(ofd, '\t\tlabel="File: ' + file + '"\n');
          fs.writeSync(ofd, "\t}\n");
        }
        // write edges
        for (var file in fdm) {
          var fileDfs = fdm[file].defines;
          var fileRqs = fdm[file].requires;
          for (var df in fileDfs) {
            for (var rq in fileRqs) {
              var rqname = fileRqs[rq];
              if (nodes.indexOf(rqname) >= 0) {
                var dfname = fileDfs[df];
                fs.writeSync(ofd, '\t"' + dfname + '" -> "' + rqname + '";\n');
              }
            }
          }
        }
        fs.writeSync(ofd, "}\n");
        fs.close(ofd, function(err) {
          warn(err);
        });
      }

      function logCyclicDependencyError(fileDependencyMap) {
        var message =
          "A cyclic dependency was found among the following files:" +
          grunt.util.linefeed;
        for (var file in fileDependencyMap)
          message += "  " + file + grunt.util.linefeed;
        mkDot(options.cycleDotReport, fileDependencyMap);
        message +=
          "See exported cycle dependency graph: " + options.cycleDotReport;
        grunt.fail.fatal(message);
      }

      function writeOutput(files, orderedFiles, options) {
        grunt.config(options.outputProperty, orderedFiles);
        var dest = getDestinationFile(files);
        if (dest) grunt.file.write(dest, JSON.stringify(orderedFiles));
      }

      function getDestinationFile(files) {
        var dest;
        files.every(function(file) {
          dest = file.dest;
          return dest == "src";
        });
        return dest != "src" ? dest : "";
      }

      function deleteIfNotLinkedFile(fdm) {
        var hasDelete = true;
        do {
          hasDelete = false;
          var nodes = {};
          var filelink = {};
          for (var file in fdm) {
            filelink[file] = 0;
            for (var def in fdm[file].defines) {
              nodes[fdm[file].defines[def]] = file;
            }
          }
          for (var file in fdm) {
            for (var req in fdm[file].requires) {
              var rname = fdm[file].requires[req];
              if (nodes[rname] !== undefined) {
                filelink[nodes[rname]] += 1;
              }
            }
          }
          for (var file in fdm) {
            if (filelink[file] === 0) {
              delete fdm[file];
              hasDelete = true;
            }
          }
        } while (hasDelete);
      }
    }
  );
};
