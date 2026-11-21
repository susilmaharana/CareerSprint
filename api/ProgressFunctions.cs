using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace CareerSprint.Api;

public sealed class ProgressDocument
{
    [Newtonsoft.Json.JsonProperty("id")] public string Id { get; set; } = "";
    [Newtonsoft.Json.JsonProperty("sessions")] public List<Session> Sessions { get; set; } = new();
    [Newtonsoft.Json.JsonProperty("problemReviews")] public List<ProblemReview> ProblemReviews { get; set; } = new();
    [Newtonsoft.Json.JsonProperty("updatedAt")] public DateTime UpdatedAt { get; set; }
}

public sealed class ProblemReview
{
    [Newtonsoft.Json.JsonProperty("problemId")] public string ProblemId { get; set; } = "";
    [Newtonsoft.Json.JsonProperty("attempts")] public int Attempts { get; set; }
    [Newtonsoft.Json.JsonProperty("lastReviewed")] public string? LastReviewed { get; set; }
    [Newtonsoft.Json.JsonProperty("nextReview")] public string? NextReview { get; set; }
    [Newtonsoft.Json.JsonProperty("confidence")] public int? Confidence { get; set; }
}

// Explicit JSON names preserve the original browser/CSV session format.
public sealed class Session
{
    [Newtonsoft.Json.JsonProperty("id")] public string Id { get; set; } = "";
    [Newtonsoft.Json.JsonProperty("date")] public string Date { get; set; } = "";
    [Newtonsoft.Json.JsonProperty("week")] public int Week { get; set; }
    [Newtonsoft.Json.JsonProperty("type")] public string Type { get; set; } = "";
    [Newtonsoft.Json.JsonProperty("title")] public string Title { get; set; } = "";
    [Newtonsoft.Json.JsonProperty("description")] public string Description { get; set; } = "";
    [Newtonsoft.Json.JsonProperty("start")] public string Start { get; set; } = "";
    [Newtonsoft.Json.JsonProperty("end")] public string End { get; set; } = "";
    [Newtonsoft.Json.JsonProperty("status")] public string Status { get; set; } = "";
    [Newtonsoft.Json.JsonProperty("minutes")] public int? Minutes { get; set; }
    [Newtonsoft.Json.JsonProperty("confidence")] public int? Confidence { get; set; }
    [Newtonsoft.Json.JsonProperty("notes")] public string Notes { get; set; } = "";
    [Newtonsoft.Json.JsonProperty("resourceUrl")] public string? ResourceUrl { get; set; }
    [Newtonsoft.Json.JsonProperty("resourceLabel")] public string? ResourceLabel { get; set; }
    [Newtonsoft.Json.JsonProperty("resourceNote")] public string? ResourceNote { get; set; }
    [Newtonsoft.Json.JsonProperty("resourceKind")] public string? ResourceKind { get; set; }
}

public sealed class ProgressFunctions(ProgressApi api)
{
    private static readonly JsonSerializerOptions ResponseJsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private static async Task<HttpResponseData> JsonResponse(HttpRequestData req, ProgressApiResponse result)
    {
        var response = req.CreateResponse(result.StatusCode);
        response.Headers.Add("Content-Type", "application/json; charset=utf-8");
        response.Headers.Add("Cache-Control", "no-store");
        if (result.ETag is not null) response.Headers.Add("ETag", result.ETag);
        await response.WriteStringAsync(JsonSerializer.Serialize(result.Body, ResponseJsonOptions));
        return response;
    }

    [Function("GetProgress")]
    public async Task<HttpResponseData> Get([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "progress")] HttpRequestData req)
    {
        req.Headers.TryGetValues("x-ms-client-principal", out var principalHeaders);
        return await JsonResponse(req, await api.GetAsync(principalHeaders));
    }

    [Function("SaveProgress")]
    public async Task<HttpResponseData> Put([HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "progress")] HttpRequestData req)
    {
        req.Headers.TryGetValues("x-ms-client-principal", out var principalHeaders);
        if (ProgressApi.GetUserDocumentId(principalHeaders) is null)
            return await JsonResponse(req, await api.PutAsync(principalHeaders, "", null));
        if (req.Body.CanSeek && req.Body.Length > 900_000)
            return await JsonResponse(req, new ProgressApiResponse(HttpStatusCode.RequestEntityTooLarge, new { error = "Payload too large" }));

        using var reader = new StreamReader(req.Body, Encoding.UTF8, leaveOpen: true);
        var raw = await reader.ReadToEndAsync();
        var etag = req.Headers.TryGetValues("If-Match", out var tags) ? tags.FirstOrDefault() : null;
        return await JsonResponse(req, await api.PutAsync(principalHeaders, raw, etag));
    }
}
