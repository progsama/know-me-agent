import { EntityService } from '../../../dist/modules/entities/entity.service.js';
import { Pool } from 'pg';

const mockPool = { query: vi.fn() };

const makePerson = (id: string, name: string, facts: string[] = []) => ({
  id,
  user_id: 'user-1',
  name,
  relationship: 'friend',
  facts,
  first_mentioned_at: new Date().toISOString(),
  last_mentioned_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

describe('EntityService', () => {
  let service: EntityService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EntityService(mockPool as unknown as Pool);
  });

  it('creates a new person when they do not exist', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          makePerson('new-id', 'Alice', ['likes coffee']),
        ],
      });

    const result = await service.upsertPerson('user-1', {
      name: 'Alice',
      relationship: 'colleague',
      facts: ['likes coffee'],
    });

    expect(result?.name).toBe('Alice');
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });

  it('updates existing person and deduplicates facts', async () => {
    const existing = makePerson('existing-id', 'Alice', ['likes coffee']);
    mockPool.query
      .mockResolvedValueOnce({ rows: [existing] })
      .mockResolvedValueOnce({
        rows: [makePerson('existing-id', 'Alice', ['likes coffee', 'has a dog'])],
      });

    const result = await service.upsertPerson('user-1', {
      name: 'Alice',
      relationship: 'colleague',
      facts: ['likes coffee', 'has a dog'],
    });

    expect(result?.name).toBe('Alice');
    const updateCall = mockPool.query.mock.calls[1] as unknown[];
    const params = updateCall[1] as unknown[];
    const factsJson = params[0] as string;
    const facts = JSON.parse(factsJson) as string[];
    expect(facts).toContain('has a dog');
    expect(facts.filter((f) => f === 'likes coffee')).toHaveLength(1);
  });

  it('does not duplicate facts when same fact provided twice', async () => {
    const existing = makePerson('existing-id', 'Bob', ['plays guitar']);
    mockPool.query
      .mockResolvedValueOnce({ rows: [existing] })
      .mockResolvedValueOnce({
        rows: [makePerson('existing-id', 'Bob', ['plays guitar'])],
      });

    await service.upsertPerson('user-1', {
      name: 'Bob',
      relationship: 'friend',
      facts: ['plays guitar', 'plays guitar'],
    });

    const updateCall = mockPool.query.mock.calls[1] as unknown[];
    const params = updateCall[1] as unknown[];
    const factsJson = params[0] as string;
    const facts = JSON.parse(factsJson) as string[];
    expect(facts.filter((f) => f === 'plays guitar')).toHaveLength(1);
  });

  it('creates a memory entry with correct category', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ id: 'mem-uuid', category: 'fact', content: 'test fact' }],
    });

    const result = await service.createMemoryEntry(
      'user-1',
      'test fact',
      'fact',
      null,
      null,
    );

    expect(result?.category).toBe('fact');
    expect(mockPool.query).toHaveBeenCalledOnce();
  });

  it('finds a person by name case-insensitively', async () => {
    mockPool.query.mockResolvedValue({
      rows: [makePerson('id-1', 'alice')],
    });

    const result = await service.getPersonByName('user-1', 'ALICE');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('alice');
  });

  it('returns all people for a user', async () => {
    mockPool.query.mockResolvedValue({
      rows: [
        makePerson('id-1', 'Alice'),
        makePerson('id-2', 'Bob'),
        makePerson('id-3', 'Charlie'),
      ],
    });

    const results = await service.getAllPeople('user-1');
    expect(results).toHaveLength(3);
  });

  it('returns null when person not found', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    const result = await service.getPersonByName('user-1', 'Nobody');
    expect(result).toBeNull();
  });
});
