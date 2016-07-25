#!/usr/bin/env node

"use strict";

var _ = require("lodash");
var util = require("util");
var inquirer = require("inquirer");
var program = require("commander");
var lionhunt = require("./lib/lionhunt");
var optionsParse = require("./lib/options");
var optionsParser = new optionsParse();
var options = {domain: null, team: null, project: null};
var prompts = [];

program
    .version("0.1.0")
    .description("Fetch a project's tasks, comments, and documents from WorkFront.")
    .option("-u, --username [username]", "Workfront user name e.g. email address.")
    .option("-p, --password [password]", "Workfront password.")
    .option("-P, --project [project]", "Workfront project name.")
    .option("-t, --team [team]", "Workfront team name.")
    .option("-a, --all-teams", "Get tasks for all teams associated with a Workfront project. Must be used with --project option above.")
    .option("-m, --mapping [file]", "A mapping file containing an array of objects.")
    .option("-o, --output [file]", "Specify an optional output file. If not provided, STDOUT is used.")
    .option("-O, --open", "Include only open tasks.")
    .option("-c, --created [date]", "Only hunt for tasks created after a valid ISO date e.g. 2016-01-01")
    .option("-v, --verbose", "Provide verbose output for debugging.")
    .arguments("<domain> <projectKey>")
    .action(function (domain, project) {
        options.domain = domain;
        options.projectKey = project;
    })
    .parse(process.argv);

optionsParser.parse(program);
_.assign(options, optionsParser.get());

if (!options.username) {
    prompts.push({
        type: "input",
        message: "Username",
        name: "name"
    });
}

if (!options.password) {
    prompts.push({
        type: "password",
        message: "Password",
        name: "pass"
    });
}

// Prompt for options that were not provided for an interactive, but not
// required experience.
inquirer
    .prompt(prompts)
    .then(function (answers) {
        if (answers.name) {
            options.username = answers.name;
        }
        if (answers.pass) {
            options.password = answers.pass;
        }
        return this;
    })
    .then(function () {
        var hunter;
        if (null === options.domain || !options.team.length || null === options.projectKey) {
            if (options.verbose) {
                console.trace("Incorrect arguments provided:");
            } else {
                console.error("Incorrect arguments provided.");
            }
            program.help();
            return;
        }

        hunter = new lionhunt(options);
        hunter.login(options.username, options.password)
            .then(hunter.stalk)
            .then(hunter.feast)
            .then(function(data) {
                if (options.verbose) {
                    console.log("Success!");
                }
                return hunter.api.logout();
            })
            .catch(function (error) {
                if (options.verbose) {
                    if (error.stack) {
                        console.error(error.stack);
                    } else {
                        console.trace("Failure: " + util.inspect(error));
                    }
                } else {
                    console.error("Failure: " + util.inspect(error));
                }
                return hunter.api.logout();
            });
    });
