const core = require('@actions/core');
const github = require('@actions/github');
const { WebClient } = require('@slack/web-api');

const diff = require("diff");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const context = github.context;
const pullRequest = context.payload.pull_request;

const pull_number = pullRequest.number;

const branch_name = core.getInput('current_branch');
const slackChannel = core.getInput('slack_channel');
const reviewers = core.getInput('reviewers');
const attributes = core.getInput('attributes');
const slackToken = core.getInput("slack_token");
const slackUsersEmail = core.getInput("slack_users_emails");

const github_token = core.getInput("gh_token");
const octokit = new github.getOctokit(github_token);
const app = new WebClient(slackToken);

const owner = context.repo.owner;
const repo = context.repo.repo;

const executeShellCommand = async (command) => {
  core.info(`Execute command: ${command}`);
  const {stdout} = await exec(`${command}`);
  return stdout;
};

const getAttributeChanges = async () => {
  core.info(`Get attribute changes: ${attributes}`);
  core.info(`Get attribute changes: ${branch_name}`);
  let greppedValue = ""
  const attributesArray = JSON.parse(attributes);
  if (!Array.isArray(attributesArray)) {
    throw new Error('The "attributes" input parameter must be an array.');
  }

  attributesArray.forEach((selector, index) => {
    greppedValue += selector + "=" + (index === attributesArray.length - 1 ? "" : "|");
  })
  const changedLines = await executeShellCommand(
      `git diff HEAD^ --word-diff | grep -E "${greppedValue}" | grep + | awk '{$1=$1};1'`
  );
  if(changedLines.split)
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
  core.info(`Branch`)
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
      "*Branch*: " + branch_name + "\n" +
      "*Repo*: " + repo + "\n";
}

const addReviewersToPullRequest = async () => {
  const prCurrentReviewers = pullRequest.requested_reviewers;
  const reviewersArray = JSON.parse(reviewers);
  if (!Array.isArray(reviewersArray)) {
    throw new Error('The "reviewers" input parameter must be an array');
  }
  const missingReviewers = reviewersArray.filter(reviewer => !prCurrentReviewers.includes(reviewer));
  const githubHeaders = {
    owner: owner,
    repo: repo,
    pull_number: pull_number,
    reviewers: missingReviewers
  }
  core.info(`About to add the following reviewers: ${missingReviewers} to pull request: ${pull_number}`);
  await octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers", githubHeaders);
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

const getSlackUsersIdsByEmail = async () => {
  const usersIdsArray = [];
  if (slackUsersEmail) {
    const usersEmailsArray = JSON.parse(slackUsersEmail);
    for(const email of usersEmailsArray) {
      const response = await app.users.lookupByEmail({
        email
      });
      usersIdsArray.push(response.user.id)
    }
  }
  return usersIdsArray;
}

const getSlackMentionsPrefix = async (usersIdsArray) => {
  let slackMessagePrefix = "";
  if (usersIdsArray.length > 0) {
    const separator = ','
    for (let i = 0; i < usersIdsArray.length; i += 1) {
      const userMention = `<@${usersIdsArray[i]}>` + (i === usersIdsArray.length - 1 ? "" : separator);
      slackMessagePrefix += userMention;
    }
  } else {
    slackMessagePrefix = `The users ${reviewers}`
  }
  return slackMessagePrefix;
}

const sendSlackMessage = async (message) => {
  try {
    core.info(`About to send slack notification to channel ID: ${slackChannel}`);
    await app.chat.postMessage({
      channel: slackChannel,
      text: message
    });
    core.info("Slack message sent successfully");
  } catch (ex) {
    core.info("Slack message notification failed. Reason: " + ex);
  }
};

async function run() {
  try {
    core.info("-----Start selectors watcher-----")
    const attributeChanges = await getAttributeChanges();
    let notificationMessage = "";
    if (attributeChanges) {
      const arrayOfChangedSelectors = getOldNewAChangesArray(attributeChanges);
      if (arrayOfChangedSelectors.length !== 0) {
        if (reviewers) {
          await addReviewersToPullRequest();
          const slackUsersIds = await getSlackUsersIdsByEmail(slackUsersEmail)
          let slackMessagePrefix = await getSlackMentionsPrefix(slackUsersIds)
          notificationMessage = await generateNotificationMessage(arrayOfChangedSelectors) +
              `${slackMessagePrefix} were added as a reviewer to the PR: \n` +
              `https://github.com/${owner}/${repo}/pull/${pull_number}`
        } else {
          notificationMessage = await generateNotificationMessage(arrayOfChangedSelectors) +
              `Reviewers list is empty. No new reviewers will be added to the PR: \n` +
              `https://github.com/${owner}/${repo}/pull/${pull_number}`
        }
        await sendSlackMessage(notificationMessage);
      } else {
        core.info("Selectors format is not supported yet")
      }
    } else {
      core.info("No changes detected in configured attributes");
    }
  } catch (ex) {
    core.info("Failed to detect attributes changes: " + ex);
  }
}

run();
