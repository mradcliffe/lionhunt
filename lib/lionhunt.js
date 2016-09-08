
var _ = require("lodash");
var Workfront = require("workfront-api");
var Promise = require("bluebird");
var fs = Promise.promisifyAll(require("fs"));

function lionhunt(options) {
    // Dumb practice.
    var self = this;

    function messageArgReplace(curr, index) {
        var regex = new RegExp('\\{' + index + '\\}');
        this.message = this.message.replace(regex, '*' + curr.text + '*');
    };

    this.domain = options.domain;
    this.teamName = options.team;
    this.projectName = options.project;
    this.projectKey = options.projectKey;
    this.openOnly = options.openOnly;
    this.createdAfter = options.createdAfter;
    this.mapping = options.mapping;
    this.baseUrl = "https://" + options.domain + ".attask-ondemand.com";
    this.api = new Workfront.Api({
        url: this.baseUrl,
        version: "5.0"
    });
    this.issues = [];

    this._getTeam = function(session) {
        var fields = ["ID", "name", "taskStatuses"];

        this.session = session;

        // Searching for the team name simply does not work so we have to go get
        // ALL of the teams and do a string match because Workfront.
        return this.api.search("team", {}, fields);
    };

    /**
     *
     * @param {Object} teams - ID, name
     * @returns {Promise}
     */
    this._getTasksForTeam = function(teams) {
        var fields = [
            "ID", "estimate", "name", "description", "status", "priority", "URL", "referenceNumber",
            "taskNumber", "enteredBy:name", "assignmentsListString", "assignedTo:name",
            "entryDate", "parameterValues", "updates:enteredByName", "updates:entryDate",
            "updates:message", "updates:messageArgs", "updates:refObjCode", "updates:ID",
            "updates:subObjID", "statusEquatesWith", "project:name", "documents:downloadURL",
            "documents:name", "documents:description", "documents:lastUpdateDate", "documents:owner:name",
            "dueDate"
        ];
        var params = {};

        teams.forEach(function (team) {
            if (team.name === self.teamName) {
                self.teamID = team.ID;
                self.statuses = team.taskStatuses;
            }
        });

        if (!self.teamID) {
            throw "Team not found!";
        }

        if (!options.allTeams) {
            params.teamID = self.teamID;
        }

        if (self.projectName) {
            params["project:name"] = self.projectName;
        }

        return self.api.count("task", params).then(function(count) {
            var queue = [],
                i = 1,
                queryParams = {
                    teamID: params.teamID,
                    "$$LIMIT": 100
                };

                if (undefined !== params.teamID) {
                    queryParams.teamID = params.teamID;
                }

                if (self.projectName) {
                    queryParams["project:name"] = self.projectName;
                }

                if (self.openOnly) {
                    queryParams.statusEquatesWith = "CPL";
                    queryParams.statusEquatesWith_Mod = "ne";
                }

                if (self.createdAfter) {
                    queryParams.entryDate = self.createdAfter;
                    queryParams.entryDate_Mod = "gte";
                }

            if (!count) {
                console.warn("No tasks found.");
                return null;
            }

            do {
                if (i > 1) {
                    queryParams["$$FIRST"] = i;
                }
                queue.push(self.api.search("task", queryParams, fields));
                i += 100 <= (count - i) ? 100 : (count - i);
            } while (i < count);

            return Promise.all(queue);
        });
    };

    this._createIssueFromTask = function(task) {
        var self = this;
        var issue;

        issue = {
            status: self._mapStatus(task.statusEquatesWith),
            reporter: null !== task.enteredBy ? task.enteredBy.name : "admin",
            summary: task.name ? task.name : "Untitled",
            description: self._getBody(task),
            labels: ["Workfront"],
            issueType: "Story",
            duedate: self._getJiraTime(task.dueDate),
            resolution: task.statusEquatesWith === "CPL" ? "Resolved" : null,
            created: self._getJiraTime(task.entryDate),
            assignee: null !== task.assignedTo ? task.assignedTo.name : "admin",
            externalId: task.referenceNumber,
            customFieldValues: [
                {
                    fieldName: "URL",
                    fieldType: "com.atlassian.jira.plugin.system.customfieldtypes:textarea",
                    value: task.URL ? task.URL : ""
                },
                {
                    fieldName: "Workfront URL",
                    fieldType: "com.atlassian.jira.plugin.system.customfieldtypes:url",
                    value: 'https://' + self.domain + '.attask-ondemand.com/task/view?ID=' + task.ID
                }
            ],
            comments: self._getComments(task),
            attachments: []
        };

        // Do Workfront normal field to Jira custom field.
        if (this.mapping.length > 0) {
            this.mapping.forEach(function(item) {
                if (undefined !== task[item.from]) {
                    issue.customFieldValues.push({
                        fieldName: item.to,
                        fieldType: item.type,
                        value: self._formatField(item, task[item.from])
                    });
                }
            });
        }

        // Find custom fields that have mapping.
        if (this.mapping.length > 0) {
            _.forEach(task.parameterValues, function(value, key) {
                var key_name = key.replace(/^DE:/, "");
                var map = self._getMapping(key_name);
                if (map !== false) {
                    issue.customFieldValues.push({
                        fieldName: map.to,
                        fieldType: map.type,
                        value: self._formatField(map, value)
                    });
                }
            });
        }

        // Add the project name as a label.
        if (null !== task.project) {
            issue.labels.push(task.project.name);
        }

        return issue;
    };

    this._getMapping = function(name) {
        var ret;
        if (this.mapping.length > 0) {
            ret = this.mapping.reduce(function(result, item) {
                if (item.from === name) {
                    result = item;
                }
                return result;
            }, false);
        }
        return ret;
    };

    this._getBody = function(task) {
        var self = this;
        var reporter = task.enteredBy ? task.enteredBy.name : "(unknown user)";

        var body = "*Reporter*: " + reporter + "\n\n";
        body += self._formatToJira(task.description) + "\n";

        _.forEach(task.parameterValues, function(value, key) {
            var key_name = key.replace(/^DE:/, "");
            if (!self._getMapping(key_name)) {
                body += key.replace(/^DE:/, "h3. ") + "\n";
                body += self._formatToJira(value) + "\n\n";
            }
        });

        // JIRA external attachments become "secure links", which means that it
        // does not directly redirect the user to the URL, but tries to open up
        // the link internally, and thus fails. This means that documents need
        // to be linked in the body. :(
        if (undefined !== task.documents && task.documents.length) {
            body += "h3. Workfront Documents\n";
            body += "|| Name || Owner || Uploaded || Link ||\n";

            task.documents.forEach(function(document) {
                var attacher = null !== document.owner ? document.owner.name : "admin";

                body += "| [" + (document.name ? document.name : "Untitled");
                body += "|" + self.baseUrl + document.downloadURL + "]";
                body += "|" + attacher;
                body += "|" + self._getJiraTime(document.lastUpdateDate);
                body += "|" + self.baseUrl + document.downloadURL + "|\n";
            });

            body += "\n";
        }

        return body;
    };

    /**
     * Format a field based on the Jira file type.
     *
     * @param {type} map
     * @param {type} value
     * @returns {string}
     */
    this._formatField = function(map, value) {
        var ret;
        switch (map.type) {
            case "com.atlassian.jira.plugin.system.customfieldtypes:textarea":
                ret = this._formatToJira(value);
                break;
            case "com.atlassian.jira.plugin.system.customfieldtypes:datepicker":
                ret = this._getJiraTime(value);
                break;
            case "com.atlassian.jira.plugin.system.customfieldtypes:datetime":
                ret = this._getJiraTime(value);
                break;
            default:
                ret = value;
                break;
        }
        return ret;
    };

    /**
     * Format Markdown back to Jira format because Jira doesn't do Markdown. :|
     *
     * Neither does Workfront, but worfront did.
     *
     * @param {String} text - The text to transform.
     */
    this._formatToJira = function(text) {
        var ret = "";

        if (undefined === text || null === text || typeof text.replace !== "function") {
            return ret;
        }

        ret = text.replace(/^(#{1,6})/gm, function(match, level) {
            return "h" + level.length + ". ";
        });

        ret = ret.replace(/^\*/gm, '-');

        ret = ret.replace(/^(\s{3})\*/gm, function(match, level) {
            var n, text = "";
            if (undefined !== level) {
                for (n = 0; n < level.length; n++) {
                    text += "-";
                }
            }
            return text += " ";
        });

        ret = ret.replace(/^(\s)?(\d)\./gm, function(match, spaces) {
            return spaces + "#";
        });

        ret = ret.replace(/```([a-z]+\n)?/gm, function(match, type) {
            var text = "{code";
            if (undefined !== type) {
                text += type.trim();
            }
            return text += "}";
        });

        ret = ret.replace(/`(.*)`/g, "{{$1}}");
        ret = ret.replace(/^>\s(.*)/g, "{quote}$1{quote}");

        return ret;
    };

    this._getJiraTime = function(datetime) {
        // Because.
        return datetime.replace(/\:\d+[-\+](\d+)$/, '');
    };

    this._getComments = function(task) {
        var comments = [];
        task.updates.forEach(function(update) {
            var description;
            if (update.updateObjCode === "NOTE") {
                description = "*Entered by*: " + update.enteredByName + "\n{quote}";
                comments.push({
                    body: description + self._formatToJira(update.message) + '{quote}',
                    author: update.enteredByName,
                    created: self._getJiraTime(update.entryDate)
                });
            } else if (update.messageArgs.length) {
                // Interpolate non-comment messages.
                update.messageArgs.forEach(messageArgReplace, update);
                description = "*" + update.enteredByName + "* ";
                comments.push({
                    body: description + update.message,
                    author: update.enteredByName,
                    created: self._getJiraTime(update.entryDate)
                });
            }
        });
        return comments;
    };

    this._processTasks = function(pages) {
        pages.forEach(function(tasks, i) {
            tasks.forEach(function(task, n) {
                self.issues.push(self._createIssueFromTask(task));
            });
        });
    };

    this._mapStatus = function(status) {
        var ret;
        if (status === "NEW") {
            ret = "To Do";
        } else if (status === "INP") {
            ret = "In Progress";
        } else {
            ret = "Done";
        }
        return ret;
    };

    this.feast = function() {
        var data = {
            projects: [
                {
                    key: self.projectKey,
                    issues: self.issues
                }
            ]
        };

        if (!self.issues.length) {
            return;
        }

        if (options.output) {
            return fs.writeFile(options.output, JSON.stringify(data));
        }

        return process.stdout.write(JSON.stringify(data));
    };

    /**
     * Get project tasks and queue each to be archived.
     *
     * @params {String} name - the team name
     * @returns {Promise}
     */
    this.stalk = function() {
        return self._getTeam()
            .then(self._getTasksForTeam)
            .then(self._processTasks);
    };

    this.login = function(name, pass) {
        return this.api.login(name, pass);
    };
};

module.exports = lionhunt;
