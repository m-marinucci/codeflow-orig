(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GitignoreMatcher = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizePath(value) {
    return String(value || '')
      .replace(/\\/g, '/')
      .replace(/^\.?\//, '')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '');
  }

  function escapeRegex(value) {
    return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }

  function globToRegex(pattern) {
    var result = '';
    for (var index = 0; index < pattern.length; index += 1) {
      var char = pattern[index];
      var next = pattern[index + 1];
      if (char === '*') {
        if (next === '*') {
          result += '.*';
          index += 1;
        } else {
          result += '[^/]*';
        }
      } else if (char === '?') {
        result += '[^/]';
      } else {
        result += escapeRegex(char);
      }
    }
    return new RegExp('^' + result + '$');
  }

  function unescapeLeading(pattern) {
    if (pattern[0] === '\\' && (pattern[1] === '#' || pattern[1] === '!')) {
      return pattern.slice(1);
    }
    return pattern;
  }

  function compileEntry(entry) {
    if (!entry || typeof entry.content !== 'string') {
      return [];
    }

    var basePath = normalizePath(entry.basePath || '');
    return entry.content
      .split(/\r?\n/)
      .map(function (line) {
        return line.replace(/\s+$/, '');
      })
      .filter(function (line) {
        return line && line.trim() && line.trim()[0] !== '#';
      })
      .map(function (line) {
        var pattern = unescapeLeading(line.trim());
        var negate = false;
        if (pattern[0] === '!') {
          negate = true;
          pattern = pattern.slice(1);
        }
        if (!pattern) {
          return null;
        }

        var directoryOnly = pattern.endsWith('/');
        if (directoryOnly) {
          pattern = pattern.slice(0, -1);
        }

        var anchored = pattern[0] === '/';
        if (anchored) {
          pattern = pattern.slice(1);
        }

        var hasSlash = pattern.indexOf('/') >= 0;
        return {
          negate: negate,
          directoryOnly: directoryOnly,
          anchored: anchored,
          hasSlash: hasSlash,
          basePath: basePath,
          regex: globToRegex(pattern),
        };
      })
      .filter(Boolean);
  }

  function isWithinBase(pathValue, basePath) {
    if (!basePath) {
      return true;
    }
    return pathValue === basePath || pathValue.indexOf(basePath + '/') === 0;
  }

  function relativeToBase(pathValue, basePath) {
    if (!basePath) {
      return pathValue;
    }
    if (pathValue === basePath) {
      return '';
    }
    return pathValue.slice(basePath.length + 1);
  }

  function directoryCandidates(relativePath, isDirectory) {
    var segments = normalizePath(relativePath)
      .split('/')
      .filter(Boolean);

    if (!segments.length) {
      return [];
    }

    var end = isDirectory ? segments.length : segments.length - 1;
    var candidates = [];
    for (var index = 1; index <= end; index += 1) {
      candidates.push(segments.slice(0, index).join('/'));
    }
    return candidates;
  }

  function matchRule(rule, candidatePath, isDirectory) {
    var normalizedCandidate = normalizePath(candidatePath);
    if (!isWithinBase(normalizedCandidate, rule.basePath)) {
      return false;
    }

    var relativePath = relativeToBase(normalizedCandidate, rule.basePath);
    if (!relativePath && !isDirectory) {
      return false;
    }

    if (rule.directoryOnly) {
      return directoryCandidates(relativePath, isDirectory).some(function (dirPath) {
        if (rule.hasSlash || rule.anchored) {
          return rule.regex.test(dirPath);
        }
        var segments = dirPath.split('/');
        return segments.some(function (segment) {
          return rule.regex.test(segment);
        });
      });
    }

    if (rule.hasSlash || rule.anchored) {
      return rule.regex.test(relativePath);
    }

    var basename = relativePath.split('/').pop();
    return rule.regex.test(basename);
  }

  function buildMatcher(entries) {
    var rules = [];
    (entries || []).forEach(function (entry) {
      rules = rules.concat(compileEntry(entry));
    });

    return {
      rules: rules,
      ignores: function (targetPath, isDirectory) {
        var ignored = false;
        rules.forEach(function (rule) {
          if (matchRule(rule, targetPath, isDirectory === true)) {
            ignored = !rule.negate;
          }
        });
        return ignored;
      },
    };
  }

  return {
    normalizePath: normalizePath,
    buildMatcher: buildMatcher,
  };
});
