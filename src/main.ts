import * as core from '@actions/core'
import * as io from '@actions/io'
import * as inputHelper from 'checkout/lib/input-helper'
import * as gitSourceProvider from 'checkout/lib/git-source-provider'
import * as gitCommandManager from 'checkout/lib/git-command-manager'
import * as inputValidator from './input-validator'
import {PullsHelper} from './pulls-helper'
import {RebaseHelper} from './rebase-helper'
import {inspect} from 'util'
import {v4 as uuidv4} from 'uuid'

async function run(): Promise<void> {
  try {
    const inputs = {
      token: core.getInput('token'),
      repository: core.getInput('repository'),
      head: core.getInput('head'),
      base: core.getInput('base')
    }
    core.debug(`Inputs: ${inspect(inputs)}`)

    const [headOwner, head] = inputValidator.parseHead(inputs.head)

    const pullsHelper = new PullsHelper(inputs.token)
    const pulls = await pullsHelper.get(
      inputs.repository,
      head,
      headOwner,
      inputs.base
    )

    if (pulls.length > 0) {
      core.info(`${pulls.length} pull request(s) found.`)

      // Checkout
      const path = uuidv4()
      process.env['INPUT_PATH'] = path
      process.env['INPUT_REF'] = 'master'
      process.env['INPUT_FETCH-DEPTH'] = '0'
      process.env['INPUT_PERSIST-CREDENTIALS'] = 'true'
      const sourceSettings = inputHelper.getInputs()
      core.debug(`sourceSettings: ${inspect(sourceSettings)}`)
      await gitSourceProvider.getSource(sourceSettings)

      // Rebase
      const git = await gitCommandManager.createCommandManager(
        sourceSettings.repositoryPath,
        sourceSettings.lfs
      )
      const rebaseHelper = new RebaseHelper(git)
      for (const pull of pulls) {
        await rebaseHelper.rebase(pull)
      }

      // Delete the repository
      core.debug(`Removing repo at '${sourceSettings.repositoryPath}'`)
      await io.rmRF(sourceSettings.repositoryPath)
    } else {
      core.info('No pull requests found.')
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
