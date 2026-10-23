// All queue keys share a versioned namespace. Every ownership change happens in Lua.
const clock = `local t = redis.call('TIME'); local now = tonumber(t[1])*1000 + math.floor(tonumber(t[2])/1000)`;

export const put = `
local existing = redis.call('HGET', KEYS[1], ARGV[1])
if existing then return existing end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])
return ARGV[2]`;

export const claim = `${clock}
local expired = redis.call('ZRANGEBYSCORE', KEYS[3], '-inf', now, 'LIMIT', 0, 100)
for _, id in ipairs(expired) do
 local raw = redis.call('HGET', KEYS[1], id)
 redis.call('ZREM', KEYS[3], id)
 if raw then
  local job = cjson.decode(raw)
  if job.state == 'active' then
   job.state = 'waiting'; job.runAt = now; job.token = nil; job.leaseUntil = nil
   redis.call('HSET', KEYS[1], id, cjson.encode(job))
   redis.call('ZADD', KEYS[2], now, id)
  end
 end
end
local due = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', now, 'LIMIT', 0, 100)
for _, id in ipairs(due) do
 local raw = redis.call('HGET', KEYS[1], id)
 redis.call('ZREM', KEYS[2], id)
 if raw then
  local job = cjson.decode(raw)
  if job.state == 'waiting' then
   job.state = 'active'; job.token = ARGV[1]; job.leaseUntil = now + tonumber(ARGV[2]); job.updatedAt = now; job.attemptsMade = job.attemptsMade + 1
   local saved = cjson.encode(job)
   redis.call('HSET', KEYS[1], id, saved)
   redis.call('ZADD', KEYS[3], job.leaseUntil, id)
   return saved
  end
 end
end
return false`;

export const renew = `${clock}
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return 0 end
local job = cjson.decode(raw)
if job.state ~= 'active' or job.token ~= ARGV[2] then return 0 end
job.leaseUntil = now + tonumber(ARGV[3])
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(job))
redis.call('ZADD', KEYS[3], job.leaseUntil, ARGV[1])
return 1`;

export const settle = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return 0 end
local old = cjson.decode(raw)
if old.state ~= 'active' or old.token ~= ARGV[2] then return 0 end
redis.call('ZREM', KEYS[2], ARGV[1]); redis.call('ZREM', KEYS[3], ARGV[1])
if ARGV[3] == '' then redis.call('HDEL', KEYS[1], ARGV[1])
else
 local job = cjson.decode(ARGV[3]); job.token = nil; job.leaseUntil = nil
 redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(job))
 if job.state == 'waiting' then redis.call('ZADD', KEYS[2], job.runAt, ARGV[1]) end
end
return 1`;

export const remove = `
redis.call('ZREM', KEYS[2], ARGV[1]); redis.call('ZREM', KEYS[3], ARGV[1])
return redis.call('HDEL', KEYS[1], ARGV[1])`;

export const cleanup = `
local jobs = redis.call('HGETALL', KEYS[1]); local count = 0
local states = cjson.decode(ARGV[1]); local before = tonumber(ARGV[2])
for i = 1, #jobs, 2 do
 local job = cjson.decode(jobs[i+1])
 if (job.state == 'completed' or job.state == 'failed') and job.updatedAt < before then
  for _, state in ipairs(states) do
   if job.state == state then
    redis.call('HDEL', KEYS[1], jobs[i]); count = count + 1; break
   end
  end
 end
end
return count`;
