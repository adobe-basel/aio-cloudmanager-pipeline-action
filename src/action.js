const core = require('@actions/core')
const {getCurrentStep} = require('@adobe/aio-lib-cloudmanager')
const {initSdk} = require('./init')
const {REQUIRED} = require('./constants')

function executeAction() {
    return new Promise((resolve) => {
        const imsOrgId = core.getInput('imsOrgId', REQUIRED)
        const programId = core.getInput('programId', REQUIRED)
        const pipelineId = core.getInput('pipelineId', REQUIRED)

        initSdk(imsOrgId).then(sdk => {
            core.info(`Creating execution for programId=${programId} and pipelineId=${pipelineId}`)

            sdk.createExecution(programId, pipelineId)
                .then(execution => {
                    core.info(`Started Pipeline Execution with ID: ${execution.id}`)

                    checkExecutionStatus(sdk, programId, pipelineId, execution.id).then(() => {
                        addSummary(sdk, programId, pipelineId, execution.id).then(() => {
                            core.info('Execution completed, see Summary for results.')
                        })
                    })

                    resolve()
                })
                .catch(e => {
                    core.error('Error creating execution', e)
                    core.setFailed(e)
                    resolve()
                })
        }).catch(e => {
            core.setFailed(e)
            resolve()
        })
    })
}

async function addSummary(sdk, programId, pipelineId, executionId) {
    sdk.getQualityGateResults(programId, pipelineId, executionId, 'codeQuality').then(result => {
        let tableData = [[
            {data: 'KPI', header: true},
            {data: 'Severity', header: true},
            {data: 'Passed', header: true},
            {data: 'Expected Value', header: true},
            {data: 'Actual Value', header: true}
        ]]

        const tableRows = result.metrics.map(metric => [
            metric.kpi,
            metric.severity,
            metric.passed,
            metric.expectedValue,
            metric.actualValue
        ])

        tableData.push(...tableRows)

        core.summary.addHeading('Code Scanning Results')
            .addTable(tableData)
            .write()
    })
}

async function checkExecutionStatus(sdk, programId, pipelineId, executionId) {
    const delay = async (ms = 10000) => new Promise(resolve => setTimeout(resolve, ms))

    let status = null;

    while (status !== 'FINISHED') {
        core.info('Checking Pipeline Execution status...')

        await sdk.getExecution(programId, pipelineId, executionId)
            .then(execution => {
                status = execution.status

                core.info(`Pipeline Execution Status: ${status}`)

                if (status !== 'FINISHED') {
                    const step = getCurrentStep(execution)

                    if (step) {
                        core.info(`Current Pipeline Execution step: action=${step.action}, status=${step.status}`)
                    }
                }
            })

        if (status !== 'FINISHED') {
            await delay()
        }
    }

    core.info('Pipeline Execution finished.')
}

module.exports = {
    executeAction
}
