import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Rate, Trend, Counter } from 'k6/metrics'

// Custom metrics
const errorRate = new Rate('errors')
const requestDuration = new Trend('request_duration')
const successfulRequests = new Counter('successful_requests')
const failedRequests = new Counter('failed_requests')

// Configuration
const baseURL = __ENV.BASE_URL || 'http://localhost:3001'
const apiKey = __ENV.API_KEY || 'test-key'
const companyCount = parseInt(__ENV.COMPANY_COUNT || '100')
const usersPerCompany = parseInt(__ENV.USERS_PER_COMPANY || '10')

export const options = {
  stages: [
    { duration: '1m', target: 100 }, // Ramp-up: 100 users
    { duration: '2m', target: 500 }, // Ramp-up: 500 users
    { duration: '2m', target: 1000 }, // Peak: 1000 users
    { duration: '1m', target: 500 }, // Ramp-down: 500 users
    { duration: '1m', target: 0 }, // Ramp-down: 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'], // 95% < 2s, 99% < 5s
    http_req_failed: ['rate<0.01'], // Error rate < 1%
    'errors': ['rate<0.01'], // Custom error rate < 1%
  },
}

/**
 * Test data generation
 * Simulates 100 companies × 10 users each
 */
function generateTestData() {
  return {
    company_id: `company_${Math.floor(Math.random() * companyCount) + 1}`,
    user_id: `user_${Math.floor(Math.random() * usersPerCompany) + 1}`,
    checklist_id: `checklist_${Math.floor(Math.random() * 50) + 1}`,
  }
}

/**
 * Scenario 1: Health Check (warm-up)
 * Every VU checks the health endpoint
 */
function scenarioHealthCheck() {
  group('Health Check', () => {
    const response = http.get(`${baseURL}/health`, {
      headers: { 'Content-Type': 'application/json' },
    })

    const success = check(response, {
      'status is 200 or 503': (r) => r.status === 200 || r.status === 503,
      'has uptime_seconds': (r) => r.body.includes('uptime_seconds'),
      'has checks': (r) => r.body.includes('checks'),
    })

    if (success) {
      successfulRequests.add(1)
    } else {
      failedRequests.add(1)
      errorRate.add(1)
    }

    requestDuration.add(response.timings.duration)
  })
}

/**
 * Scenario 2: Execute Checklist (main workload)
 * 1. Create execution
 * 2. Fill activities
 * 3. Finalize
 */
function scenarioExecuteChecklist() {
  const data = generateTestData()

  group('Execute Checklist', () => {
    // Step 1: Create execution
    const createPayload = JSON.stringify({
      checklist_id: data.checklist_id,
      company_id: data.company_id,
      user_id: data.user_id,
    })

    const createResponse = http.post(`${baseURL}/api/execucoes`, createPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      timeout: '5s',
    })

    const executionCreated = check(createResponse, {
      'execution created (201 or 200)': (r) => r.status === 201 || r.status === 200,
      'has execution_id': (r) => r.body.includes('id'),
    })

    if (!executionCreated) {
      failedRequests.add(1)
      errorRate.add(1)
      return
    }

    successfulRequests.add(1)
    requestDuration.add(createResponse.timings.duration)

    const executionId = JSON.parse(createResponse.body).id
    sleep(0.5) // Simulate user filling form

    // Step 2: Finalize execution
    const finalizePayload = JSON.stringify({
      status: 'finalizado',
      resultado: 'OK',
    })

    const finalizeResponse = http.post(
      `${baseURL}/api/execucoes/${executionId}/finalizar`,
      finalizePayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        timeout: '5s',
      }
    )

    const executionFinalized = check(finalizeResponse, {
      'execution finalized (200)': (r) => r.status === 200,
      'has result': (r) => r.body.includes('resultado'),
    })

    if (executionFinalized) {
      successfulRequests.add(1)
    } else {
      failedRequests.add(1)
      errorRate.add(1)
    }

    requestDuration.add(finalizeResponse.timings.duration)
  })
}

/**
 * Scenario 3: Billing Webhook (simulate end-of-month)
 * Asaas sends payment confirmation
 */
function scenarioBillingWebhook() {
  const data = generateTestData()

  group('Billing Webhook', () => {
    const webhookPayload = JSON.stringify({
      event: 'PAYMENT_CONFIRMED',
      data: {
        billing_id: `bill_${data.company_id}`,
        value: 300,
      },
      id: `evt_${Date.now()}_${Math.random()}`,
    })

    const response = http.post(`${baseURL}/api/billing/webhook/asaas`, webhookPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': __ENV.WEBHOOK_SECRET || 'test-secret',
      },
      timeout: '5s',
    })

    const success = check(response, {
      'webhook accepted (200 or 202)': (r) => r.status === 200 || r.status === 202,
      'idempotent (duplicate rejected or accepted)': (r) => r.status === 200 || r.status === 409,
    })

    if (success) {
      successfulRequests.add(1)
    } else {
      failedRequests.add(1)
      errorRate.add(1)
    }

    requestDuration.add(response.timings.duration)
  })
}

/**
 * Main test function
 * Distributes load across scenarios
 */
export default function () {
  const scenario = Math.random()

  if (scenario < 0.7) {
    // 70% checklist execution (main workload)
    scenarioExecuteChecklist()
  } else if (scenario < 0.9) {
    // 20% health checks
    scenarioHealthCheck()
  } else {
    // 10% webhook simulation
    scenarioBillingWebhook()
  }

  sleep(Math.random() * 3) // Random think-time between requests
}

/**
 * Teardown: Summary
 */
export function handleSummary(data) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Load Test Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const metrics = data.metrics
  const http_reqs = metrics.http_reqs?.value || 0
  const http_failures = metrics.http_req_failed?.value || 0
  const duration = metrics.http_req_duration
  const success_rate = ((http_reqs - http_failures) / http_reqs * 100).toFixed(2)

  console.log(`Total Requests:    ${http_reqs}`)
  console.log(`Failed:            ${http_failures}`)
  console.log(`Success Rate:      ${success_rate}%`)
  if (duration) {
    console.log(`P50 Latency:       ${duration.stats?.p(0.5).toFixed(0)}ms`)
    console.log(`P95 Latency:       ${duration.stats?.p(0.95).toFixed(0)}ms`)
    console.log(`P99 Latency:       ${duration.stats?.p(0.99).toFixed(0)}ms`)
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  return {
    stdout: JSON.stringify(data, null, 2),
  }
}
