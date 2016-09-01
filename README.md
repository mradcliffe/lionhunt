# lionhunt

lionhunt is a Workfront to JIRA export tool written in node.js that allows to export all of a Workfront Team's tasks as JIRA issues.

This includes

* Tasks
* Task updates
   * Task transitions are added as issue comments.
* Task documents
   * Task documents are added into a table in the issue description because attached links become "secure links", which are useless.

## Usage

```bash
lionhunt -u username -p password -t "Workfront Team" -P "Workfront Project" <domain> <project key>
```

This will output to a file `export.json`.

### Arguments

#### domain

The Workfront on-demand *domain*, which is the sub-domain of the Workfront On-Demand domain name e.g. **domain**.attask-ondemand.com

#### team

Team name as a string enclosed by double quotes for a team name containing spaces.

### Options

#### username

The Workfront user name to log in as. This is required, and if not provided as an option, lionhunt will prompt for the user name.

#### password

The corresponding password for the user name above. This is required, and if not provided as an option, lionhunt will prompt for the password.

#### project

An optional Workfront project to restrict to.

#### team

A required Worfkront team

### all-teams

Optionally include all teams when using the `project` team option. This still requires the `team` option.

#### mapping

A JSON file with an array of custom field mapping objects e.g.

```json
[
  {
    "from": "Acceptance Criteria",
    "to": "Acceptance Criteria",
    "type": "com.atlassian.jira.plugin.system.customfieldtypes:textarea"
  }
]
```

#### created

Only hunt for tasks created after the specified ISO date.

#### open

Only hunt for open tasks.

#### verbose

Use verbose output. This is useful when running interactively, but should be disabled when providing all options on the command line.

### output

Provide an output file name to write to. By default, output is printed to `STDOUT`.

### interactive

Run in interactive mode to prompt for username and password. Otherwise, username and password are required options.

## TODO

* Support nested comments.
   * This is a pain in the butt to do and increases execution time/explodes the number of requests needed.

### Probably won't do

* Add support for issue history/transitions from Workfront.
* Sub-tasks or issues.
* Downloading documents and re-attaching to JIRA. This is only supported for linking to Workfront.
