using System.Net;
using System.Text.Json;

namespace CareerSprint.Api;

public sealed record StoredProgress(ProgressDocument Document, string ETag);

public interface IProgressStore
{
    Task<StoredProgress?> ReadAsync(string userDocumentId);
    Task<string> CreateAsync(ProgressDocument document);
    Task<string> ReplaceAsync(ProgressDocument document, string etag);
}

public sealed class ProgressConflictException : Exception { }

public sealed record ProgressApiResponse(HttpStatusCode StatusCode, object Body, string? ETag = null);

/// <summary>Application-level API behavior, isolated from the Azure Functions transport for automated tests.</summary>
public sealed class ProgressApi(IProgressStore store)
{
    private static readonly JsonSerializerOptions RequestJsonOptions = new() { PropertyNameCaseInsensitive = true };

    public static string? GetUserDocumentId(IEnumerable<string>? principalHeaders)
    {
        var encodedPrincipal = principalHeaders?.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(encodedPrincipal)) return null;

        try
        {
            using var doc = JsonDocument.Parse(Convert.FromBase64String(encodedPrincipal));
            var principal = doc.RootElement;
            if (!principal.TryGetProperty("userRoles", out var roles) || roles.ValueKind != JsonValueKind.Array ||
                !roles.EnumerateArray().Any(role => role.ValueKind == JsonValueKind.String && role.GetString() == "authenticated"))
                return null;
            if (!principal.TryGetProperty("userId", out var userIdElement) || userIdElement.ValueKind != JsonValueKind.String)
                return null;

            var userId = userIdElement.GetString();
            return string.IsNullOrWhiteSpace(userId) ? null : $"user-{userId}";
        }
        catch (Exception ex) when (ex is FormatException or JsonException or InvalidOperationException)
        {
            return null;
        }
    }

    public async Task<ProgressApiResponse> GetAsync(IEnumerable<string>? principalHeaders)
    {
        var userDocumentId = GetUserDocumentId(principalHeaders);
        if (userDocumentId is null)
            return new(HttpStatusCode.Unauthorized, new { error = "Sign in through the Static Web App." });

        try
        {
            var stored = await store.ReadAsync(userDocumentId);
            if (stored is null) return new(HttpStatusCode.OK, new { sessions = (object?)null });
            return new(HttpStatusCode.OK, new
            {
                sessions = stored.Document.Sessions,
                problemReviews = stored.Document.ProblemReviews,
                updatedAt = stored.Document.UpdatedAt
            }, stored.ETag);
        }
        catch (Exception)
        {
            return new(HttpStatusCode.ServiceUnavailable, new { error = "Unable to load progress." });
        }
    }

    public async Task<ProgressApiResponse> PutAsync(IEnumerable<string>? principalHeaders, string raw, string? etag)
    {
        var userDocumentId = GetUserDocumentId(principalHeaders);
        if (userDocumentId is null)
            return new(HttpStatusCode.Unauthorized, new { error = "Unauthorized" });
        return await PutForUserAsync(userDocumentId, raw, etag);
    }

    public async Task<ProgressApiResponse> PutForUserAsync(string userDocumentId, string raw, string? etag)
    {
        if (raw.Length > 900_000)
            return new(HttpStatusCode.BadRequest, new { error = "Invalid progress data." });

        ProgressDocument data;
        try
        {
            using var json = JsonDocument.Parse(raw);
            var root = json.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("sessions", out var sessionsElement))
                throw new ArgumentException("Missing sessions");

            var sessions = JsonSerializer.Deserialize<List<Session>>(sessionsElement.GetRawText(), RequestJsonOptions);
            var reviews = root.TryGetProperty("problemReviews", out var reviewElement)
                ? JsonSerializer.Deserialize<List<ProblemReview>>(reviewElement.GetRawText(), RequestJsonOptions)
                : new List<ProblemReview>();
            Validate(sessions, reviews);
            data = new ProgressDocument
            {
                Id = userDocumentId,
                Sessions = sessions!,
                ProblemReviews = reviews!,
                UpdatedAt = DateTime.UtcNow
            };
        }
        catch (Exception ex) when (ex is ArgumentException or JsonException or InvalidOperationException or KeyNotFoundException)
        {
            return new(HttpStatusCode.BadRequest, new { error = "Invalid progress data." });
        }

        try
        {
            var savedEtag = string.IsNullOrEmpty(etag)
                ? await store.CreateAsync(data)
                : await store.ReplaceAsync(data, etag);
            return new(HttpStatusCode.OK, new { updatedAt = data.UpdatedAt }, savedEtag);
        }
        catch (ProgressConflictException)
        {
            return new(HttpStatusCode.Conflict, new { error = "Progress changed in another tab or device. Export a backup, then reload before editing." });
        }
        catch (Exception)
        {
            return new(HttpStatusCode.ServiceUnavailable, new { error = "Unable to save progress." });
        }
    }

    private static void Validate(List<Session>? sessions, List<ProblemReview>? reviews)
    {
        if (sessions is null || sessions.Count > 500 || sessions.Any(s => s is null ||
            string.IsNullOrWhiteSpace(s.Id) || s.Id.Length > 120 ||
            string.IsNullOrWhiteSpace(s.Title) || s.Title.Length > 160 ||
            s.Notes is null || s.Notes.Length > 8000 || s.Description is null || s.Description.Length > 10000 ||
            s.Week < 1 || s.Week > 52 || string.IsNullOrWhiteSpace(s.Date) ||
            !System.Text.RegularExpressions.Regex.IsMatch(s.Date, @"^\d{4}-\d{2}-\d{2}$") ||
            s.Minutes is < 0 or > 1440 || s.Confidence is < 1 or > 5))
            throw new ArgumentException("Invalid sessions");
        if (sessions.Select(s => s.Id).Distinct().Count() != sessions.Count)
            throw new ArgumentException("Duplicate IDs");

        if (reviews is null || reviews.Count > 500 || reviews.Any(r => r is null ||
            string.IsNullOrWhiteSpace(r.ProblemId) || r.ProblemId.Length > 120 ||
            r.Attempts < 0 || r.Attempts > 10000 || r.Confidence is < 1 or > 5 ||
            (r.LastReviewed is not null && !System.Text.RegularExpressions.Regex.IsMatch(r.LastReviewed, @"^\d{4}-\d{2}-\d{2}$")) ||
            (r.NextReview is not null && !System.Text.RegularExpressions.Regex.IsMatch(r.NextReview, @"^\d{4}-\d{2}-\d{2}$"))))
            throw new ArgumentException("Invalid problem reviews");
        if (reviews.Select(r => r.ProblemId).Distinct().Count() != reviews.Count)
            throw new ArgumentException("Duplicate problem reviews");
    }
}
