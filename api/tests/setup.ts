process.env['NODE_ENV'] = 'test'
process.env['API_KEY_PEPPER'] = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
process.env['DATABASE_URL'] = 'postgresql://localhost:5432/tokensentry_test'
process.env['VALKEY_URL'] = 'redis://localhost:6379/1'
process.env['LOG_LEVEL'] = 'fatal'

// Initialize catalog service for tests
import { initializeCatalog } from '../src/catalog-bootstrap.js'
await initializeCatalog()
