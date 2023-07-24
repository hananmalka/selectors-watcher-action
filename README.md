
# Selectors Watcher Action

![Hits](https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=https%3A%2F%2Fgithub.com%2Fhananmalka1212%2Fhit-counter&count_bg=%2379C83D&title_bg=%23555555&icon=&icon_color=%23961212&title=hits&edge_flat=false)
![Stars](https://img.shields.io/github/stars/hananmalka/selectors-watcher-action)

Keep your automation project **stable** by detecting and notifying attributes code changes.


## Table Of Contents

* [General Info](#general-info)
* [Features](#features)
* [Parameters](#input-parameters)
* [Usage](#usage)
---
## General Info

This is a **GitHub action** implementation of the [`selectors-watcher`](https://github.com/hananmalka/selectors-watcher) NPM package.

By adding this action to your workflow you will be able to notify relevant stakeholders with any attributes change in order to avoid instability and lack of communication between developers and automation engineers.
## Features
* Detect code changes according to predefined selectors
* Notify stakeholders using Slack, showing the old and the new versions of changed selectors
* Add relevant stakeholders as a pull request reviewers
## Parameters




| Name | Type     | Description |         Required        | Default|
| :-------- | :------- |:------------ |:------------------------- |:-----------|
| `token` | `string` |Github token to be able to make API actions | Yes | Empty |
| `slack_channel` | `string` | The slack channel (ID) <br />you want to send notifications | Yes - If `reviewers` param provided,<br />otherwise - No | Empty |
| `slack_token` | `string` | Slack bot token (Set as a repo secret) | Yes | Empty |
|`attributes` | `Array (string)` | The attributes you want to detect changes in <br />e.g. `test-id`, `qa-id`, `automation-id`| Yes | `'["id"]'` |
|`reviewers`| `Array (string)`| Array of revierwers to be added to the pull request| No| `'[]'`
|`slack_users_emails` | `Array (string)` | The slack users email. <br />This is for case you want to mention the reviewers in the slack message. | No | `'[]'` |


## Usage

In order to be able to detect code changes, you need to `checkout` the repo first.  
`selectors-watcher-action` can be used as a **workflow** or as a **step in a workflow**.  
Since the `selectors-watcher-action` works on a pull request - the workflow trigger should be a `pull request`


#### Example:
```selectors-watcher-workflow.yaml```
```yaml
name: Selectors Watcher

on:             //The trigger should be a pull request
  pull_request:
    types: [opened, edited, synchronize, reopened]

jobs:
  selectors:
    runs-on: ubuntu-latest
    name: Selectors watcher
    steps:
      - name: Checkout repo             //Need to checkout the repo
        uses: actions/checkout@v3
        with:
          fetch-depth: 0            //Means all commits history of the current branch
          ref: ${ GITHUB_HEAD_REF }
      - uses: hananmalka/selectors-watcher-action@v1
        with:
          token: ${{ secrets.GHP_TOKEN }}
          slack_channel: "YOUR_SLACK_CHANNEL_ID"
          slack_token: ${{ secrets.SLACK_TOKEN }}
          reviewers: '["jane doe"]'
          attributes: '["qa-id"]'
          slack_users_emails: '["jane.doe@gmail.com"]'
```


## Slack message output

<a href="https://imgbox.com/h7G3Gtbx" target="_blank"><img src="https://images2.imgbox.com/98/6b/h7G3Gtbx_o.png" alt="image host"/></a>
## 🔗 Links
[![linkedin](https://img.shields.io/badge/linkedin-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/hananmalka)



### If you find this action useful feel free to buy me a coffee :)

<a href="https://www.buymeacoffee.com/hananmalka" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
