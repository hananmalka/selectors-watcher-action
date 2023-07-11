const core = require('@actions/core');
const github = require('@actions/github');

const diff = require("diff");
const axios = require("axios");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
// const path = require("path");


const context = github.context;
const pullRequest = context.payload.pull_request;

const pull_number = pullRequest.number;
const baseBranch = pullRequest.base.ref;

const slackChannel = core.getInput('slack_channel');
const reviewers = core.getInput('reviewers');
const attributes = core.getInput('attributes');
const slackToken = core.getInput("slack_token");
const octokit = github.getOctokit(core.getInput("token"));
const owner = context.repo.owner;
const repo = context.repo;

// const workspacePath = process.env.GITHUB_WORKSPACE;
// const repoPath = path.resolve(workspacePath);

const executeShellCommand = async (command) => {
  const {stdout} = await exec(`${command}`);
  return stdout;
};

const getAttributeChanges = async () => {
  core.info(`Get attribute changes: ${attributes}`);
  let greppedValue = ""
  const attributesArray = JSON.parse(attributes);
  if (!Array.isArray(attributesArray)) {
    throw new Error('The "attributes" input parameter must be an array.');
  }

  attributesArray.forEach((selector, index) => {
    greppedValue += selector + "=" + (index === attributes.length - 1 ? "" : "|");
  })
  const changedLines = await executeShellCommand(
      `git diff HEAD^ --word-diff | grep -E "${greppedValue}" | grep + | awk '{$1=$1};1'`
  );
  core.info(`Attribute changes: \n${changedLines}`)
  return changedLines.split("\n");
};

const getOldNewAChangesArray = (gitChanges) => {
  const changesObjectArray = [];
  const attributesArray = JSON.parse(attributes);
  if (!Array.isArray(attributesArray)) {
    throw new Error('The "attributes" input parameter must be an array.');
  }
  const selectorNames = attributesArray.join("|");
  let match;
  const regexPattern = new RegExp(`\\[-(.*?${selectorNames}.*?)-\\]\\{\\+(.*?${selectorNames}.*?)\\+\\}`, 'g');
  for (let i = 0; i < gitChanges.length - 1; i += 1) {
    while ((match = regexPattern.exec(gitChanges[i])) !== null) {
      const oldValue = match[1];
      const newValue = match[2];
      const difference = getDiffBetweenStrings(oldValue, newValue);
      const changesObject = {
        old: oldValue,
        new: newValue,
        diff: difference
      }
      changesObjectArray.push(changesObject);
    }
  }
  return changesObjectArray;
}

const generateNotificationMessage = async(arrayOfChangedSelectors) => {
  let selectorsChangesFormatted = "";
  const separator = '\n-----------------------------------------------------------------------------\n'
  for (let i = 0; i < arrayOfChangedSelectors.length; i += 1) {
    const idChangesFormat = "*Origin:* " + arrayOfChangedSelectors[i].old + "\n" +
        "*New:* " + arrayOfChangedSelectors[i].new + "\n" +
        "*Diff:* " + arrayOfChangedSelectors[i].diff.action + " *\"" + arrayOfChangedSelectors[i].diff.value
        + "\"* " + (i === arrayOfChangedSelectors.length - 1 ? "\n" : separator);
    selectorsChangesFormatted += idChangesFormat;
  }
  return ":Warning: The following selectors has been changed:\n\n" +
      `${selectorsChangesFormatted}\n` +
      "*Branch*: " + baseBranch + "\n" +
      "*Service*: " + repo + "\n";
}

const addReviewersToPullRequest = async (pullRequest) => {
  const prCurrentReviewers = pullRequest.requested_reviewers;
  const missingReviewers = reviewers.filter(value => !prCurrentReviewers.includes(value));
  const githubHeaders = {
    owner,
    repo,
    pull_number,
    reviewers: missingReviewers
  }

  const response = await octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers", githubHeaders);
  return response.data;
};

const getDiffBetweenStrings = (oldValue, newValue) => {
  const difference = {};
  diff.diffWords(oldValue, newValue).filter((item) => {
    if (item.added && item.value !== "+") {
      difference.action = "added";
      difference.value = item.value;
    } else if (item.removed && item.value !== "-") {
      difference.action = "removed";
      difference.value = item.value;
    }
  });
  return difference;
}

const sendSlackMessage = async (message) => {
  await axios.post('https://slack.com/api/chat.postMessage', {
    channel: slackChannel,
    text: message
  }, {
    headers: {
      'Authorization': `Bearer ${slackToken}`,
      'Content-Type': 'application/json'
    }
  })
};

async function run() {
  try {
    const attributeChanges = await getAttributeChanges();
    let notificationMessage = "";
    if (attributeChanges) {
      const arrayOfChangedSelectors = getOldNewAChangesArray(attributeChanges);
      if (arrayOfChangedSelectors.length !== 0) {
        notificationMessage = await generateNotificationMessage(arrayOfChangedSelectors);
        await addReviewersToPullRequest(pullRequest);
        notificationMessage += notificationMessage +
            `you were added as a reviewer to the PR: \n` +
            `https://github.com/${owner}/${repo}/pull/${pull_number}`
        await sendSlackMessage(notificationMessage);
      } else {
        core.info("Selectors format is not supported yet")
      }
    } else {
      core.info("Automation selectors weren't changed");
    }
  } catch (ex) {
    core.info("Failed to detect attributes changes: " + ex);
  }
}

run();
