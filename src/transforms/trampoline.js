'use strict';

var replace = require('estraverse').replace;
var Syntax = require('estraverse').Syntax;
var build = require('ast-types').builders;
var types = require('ast-types').namedTypes;
var parse = require('esprima').parse;

var fail = require('../syntax').fail;
var inProgram = require('../syntax').inProgram;
var isPrimitive = require('../syntax').isPrimitive;
var util = require('../util');


function thunkify(node) {
  return build.functionExpression(
      null, [],
      build.blockStatement([
        build.returnStatement(node)
      ]), false, false);
}

function skip(node) {
  if (types.ReturnStatement.check(node)) {
    this.skip();
  }
}

function trampoline(node) {
  switch (node.type) {

    // re-direct all non-primitive calls through trampoline
    // this is only okay in cps where no implicit stack is used!
    case Syntax.ExpressionStatement:
      switch (node.expression.type) {
        case Syntax.CallExpression:
          if (isPrimitive(node.expression.callee)) {
            return node;
          }
          else {
            return build.returnStatement(thunkify(node.expression));
          }
        default:
          return build.returnStatement(thunkify(node.expression));
      }
    default:
      return node;
  }
}

var cliTrampoline = function(t) {
  while (t) {
    t = t()
  }
};

var webTrampoline = function(t) {
  var lastPauseTime = Date.now();
  while (t) {
    var currTime = Date.now();
    if (currTime - lastPauseTime > 100) {
      return setTimeout(function() { webTrampoline(t) }, 0);
    } else {
      t = t();
    }
  }
};

var runner = util.runningInBrowser() ? webTrampoline : cliTrampoline;

var driver = parse(['(function (p) {',
                    '  var runTrampoline = ' + runner.toString(),
                    '  return function(s, k, a) {',
                    '    var t = p(s, k, a);',
                    '    runTrampoline(t);',
                    '  }',
                    '})'].join('\n')
).body[0].expression;

function trampolineMain(node) {
  var r = inProgram(function(node) {
    return build.callExpression(driver, [replace(node, {
      enter: skip,
      leave: trampoline
    })]);
  })(node, fail('trampoline', node));

  return r;
}

module.exports = {
  trampoline: trampolineMain,
  runner: runner
};
