using System.Net;
using System.Text;
using System.Text.Json;
using CareerSprint.Api;
using JsonConvert = Newtonsoft.Json.JsonConvert;
using Xunit;

namespace CareerSprint.Api.Tests;

public sealed class ProgressApiTests
{
    private static readonly JsonSerializerOptions BrowserJsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    [Fact]
    public async Task PutAndGet_RoundTripBrowserSessionAndProblemReviewFields()
    {
        var store = new JsonBackedProgressStore();
        var api = new ProgressApi(store);
        var principal = Principal("alice");

        var put = await api.PutAsync(principal, BrowserPayload("Rich notes ✓"), null);
        var get = await api.GetAsync(principal);
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(get.Body, BrowserJsonOptions));
        var session = json.RootElement.GetProperty("sessions")[0];
        var review = json.RootElement.GetProperty("problemReviews")[0];

        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        Assert.Equal("\"v1\"", put.ETag);
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        Assert.Equal("\"v1\"", get.ETag);
        Assert.Equal("Rich notes ✓", session.GetProperty("notes").GetString());
        Assert.Equal("https://www.hackerrank.com/challenges/icecream-parlor/problem", session.GetProperty("resourceUrl").GetString());
        Assert.Equal("Practice on HackerRank", session.GetProperty("resourceLabel").GetString());
        Assert.Equal("Pair-sum analogue", session.GetProperty("resourceNote").GetString());
        Assert.Equal("hackerrank", session.GetProperty("resourceKind").GetString());
        Assert.Equal("two-sum", review.GetProperty("problemId").GetString());
        Assert.Equal(3, review.GetProperty("confidence").GetInt32());
    }

    [Fact]
    public async Task GetAndPut_RejectMissingOrUnauthenticatedPrincipalWithoutStoreAccess()
    {
        var store = new JsonBackedProgressStore();
        var api = new ProgressApi(store);

        var noHeader = await api.GetAsync(null);
        var anonymous = await api.PutAsync(Principal("alice", "anonymous"), BrowserPayload(), null);
        var malformed = await api.GetAsync(new[] { "not-base64" });

        Assert.Equal(HttpStatusCode.Unauthorized, noHeader.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, malformed.StatusCode);
        Assert.Empty(store.Documents);
    }

    [Fact]
    public void PrincipalParser_UsesOnlyAuthenticatedTrustedUserId()
    {
        Assert.Equal("user-user-a", ProgressApi.GetUserDocumentId(Principal("user-a")));
        Assert.Null(ProgressApi.GetUserDocumentId(Principal("user-a", "anonymous")));
        Assert.Null(ProgressApi.GetUserDocumentId(Principal("", "authenticated")));
        Assert.Null(ProgressApi.GetUserDocumentId(new[] { Convert.ToBase64String(Encoding.UTF8.GetBytes("{}")) }));
    }

    [Fact]
    public async Task UserDocuments_AreIsolatedByPrincipalId()
    {
        var store = new JsonBackedProgressStore();
        var api = new ProgressApi(store);
        await api.PutAsync(Principal("alice"), BrowserPayload("Alice's notes"), null);
        await api.PutAsync(Principal("bob"), BrowserPayload("Bob's notes"), null);

        var alice = await api.GetAsync(Principal("alice"));
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(alice.Body, BrowserJsonOptions));

        Assert.Equal("Alice's notes", json.RootElement.GetProperty("sessions")[0].GetProperty("notes").GetString());
        Assert.Equal(new[] { "user-alice", "user-bob" }, store.Documents.Keys.OrderBy(x => x));
    }

    [Fact]
    public async Task Put_AcceptsLegacyPayloadWithoutProblemReviews()
    {
        var store = new JsonBackedProgressStore();
        var api = new ProgressApi(store);
        const string legacy = """
            {"sessions":[{"id":"legacy-1","date":"2026-11-23","week":1,"type":"Coding + concept","title":"Legacy","description":"","start":"20:30","end":"21:45","status":"Completed","minutes":null,"confidence":null,"notes":""}]}
            """;

        var put = await api.PutAsync(Principal("alice"), legacy, null);
        var get = await api.GetAsync(Principal("alice"));
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(get.Body, BrowserJsonOptions));

        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        Assert.Empty(json.RootElement.GetProperty("problemReviews").EnumerateArray());
    }

    [Fact]
    public void LegacyCosmosDocument_DeserializesWithoutReviewOrResourceFields()
    {
        const string olderDocument = """
            {"id":"user-legacy","sessions":[{"id":"prep-001","date":"2026-11-23","week":1,"type":"Coding + concept","title":"Legacy","description":"","start":"20:30","end":"21:45","status":"Completed","minutes":35,"confidence":4,"notes":""}],"updatedAt":"2026-11-23T04:00:00Z"}
            """;

        var restored = JsonConvert.DeserializeObject<ProgressDocument>(olderDocument)!;

        Assert.Empty(restored.ProblemReviews);
        Assert.Null(restored.Sessions[0].ResourceUrl);
        Assert.Null(restored.Sessions[0].ResourceLabel);
        Assert.Null(restored.Sessions[0].ResourceNote);
        Assert.Null(restored.Sessions[0].ResourceKind);
    }

    [Fact]
    public async Task Put_RejectsInvalidAndDuplicateSessionIds()
    {
        var store = new JsonBackedProgressStore();
        var api = new ProgressApi(store);
        var duplicate = "{\"sessions\":[" + ValidSessionJson("dup") + "," + ValidSessionJson("dup") + "]}";
        var invalidConfidence = "{\"sessions\":[" + ValidSessionJson("bad", confidence: 6) + "]}";

        Assert.Equal(HttpStatusCode.BadRequest, (await api.PutAsync(Principal("alice"), duplicate, null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await api.PutAsync(Principal("alice"), invalidConfidence, null)).StatusCode);
        Assert.Empty(store.Documents);
    }

    [Fact]
    public async Task Put_UsesCreateThenConditionalReplaceAndRejectsStaleEtag()
    {
        var store = new JsonBackedProgressStore();
        var api = new ProgressApi(store);
        var principal = Principal("alice");
        var created = await api.PutAsync(principal, BrowserPayload("first"), null);
        var read = await api.GetAsync(principal);
        var updated = await api.PutAsync(principal, BrowserPayload("second"), read.ETag);
        var stale = await api.PutAsync(principal, BrowserPayload("stale overwrite"), read.ETag);
        var final = await api.GetAsync(principal);
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(final.Body, BrowserJsonOptions));

        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        Assert.Equal("\"v1\"", created.ETag);
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.Equal("\"v2\"", updated.ETag);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("\"v2\"", final.ETag);
        Assert.Equal("second", json.RootElement.GetProperty("sessions")[0].GetProperty("notes").GetString());
    }

    [Fact]
    public async Task PutWithoutEtag_DoesNotOverwriteExistingDocument()
    {
        var store = new JsonBackedProgressStore();
        var api = new ProgressApi(store);
        var principal = Principal("alice");
        await api.PutAsync(principal, BrowserPayload("original"), null);

        var conflict = await api.PutAsync(principal, BrowserPayload("overwrite"), null);
        var read = await api.GetAsync(principal);
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(read.Body, BrowserJsonOptions));

        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        Assert.Equal("original", json.RootElement.GetProperty("sessions")[0].GetProperty("notes").GetString());
    }

    [Fact]
    public async Task Get_MissingDocumentReturnsNullSessionsWithoutEtag()
    {
        var api = new ProgressApi(new JsonBackedProgressStore());
        var response = await api.GetAsync(Principal("new-user"));
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(response.Body, BrowserJsonOptions));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(response.ETag);
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("sessions").ValueKind);
    }

    private static string[] Principal(string userId, params string[] roles)
    {
        var payload = JsonSerializer.Serialize(new { userId, userRoles = roles.Length == 0 ? new[] { "authenticated" } : roles });
        return new[] { Convert.ToBase64String(Encoding.UTF8.GetBytes(payload)) };
    }

    private static string BrowserPayload(string notes = "Rich notes ✓") => JsonSerializer.Serialize(new
    {
        sessions = new[]
        {
            new
            {
                id = "prep-001", date = "2026-11-23", week = 1, type = "Coding + concept", title = "W01 — Two Sum",
                description = "Study instructions", start = "20:30", end = "21:45", status = "Completed",
                minutes = 35, confidence = 4, notes,
                resourceUrl = "https://www.hackerrank.com/challenges/icecream-parlor/problem",
                resourceLabel = "Practice on HackerRank", resourceNote = "Pair-sum analogue", resourceKind = "hackerrank"
            }
        },
        problemReviews = new[]
        {
            new { problemId = "two-sum", attempts = 1, lastReviewed = "2026-11-20", nextReview = "2026-11-27", confidence = 3 }
        }
    });

    private static string ValidSessionJson(string id, int confidence = 4) => JsonSerializer.Serialize(new
    {
        id, date = "2026-11-23", week = 1, type = "Coding + concept", title = "Valid session",
        description = "", start = "20:30", end = "21:45", status = "Completed", minutes = 35,
        confidence, notes = ""
    });

    private sealed class JsonBackedProgressStore : IProgressStore
    {
        private readonly Dictionary<string, (string Json, string ETag)> documents = new();

        public IReadOnlyDictionary<string, (string Json, string ETag)> Documents => documents;

        public Task<StoredProgress?> ReadAsync(string userDocumentId)
        {
            if (!documents.TryGetValue(userDocumentId, out var item)) return Task.FromResult<StoredProgress?>(null);
            var document = JsonConvert.DeserializeObject<ProgressDocument>(item.Json)!;
            return Task.FromResult<StoredProgress?>(new StoredProgress(document, item.ETag));
        }

        public Task<string> CreateAsync(ProgressDocument document)
        {
            if (documents.ContainsKey(document.Id)) throw new ProgressConflictException();
            return Task.FromResult(Store(document, "\"v1\""));
        }

        public Task<string> ReplaceAsync(ProgressDocument document, string etag)
        {
            if (!documents.TryGetValue(document.Id, out var current) || current.ETag != etag)
                throw new ProgressConflictException();
            var version = int.Parse(current.ETag.Trim('"').TrimStart('v')) + 1;
            return Task.FromResult(Store(document, $"\"v{version}\""));
        }

        private string Store(ProgressDocument document, string etag)
        {
            documents[document.Id] = (JsonConvert.SerializeObject(document), etag);
            return etag;
        }
    }
}
