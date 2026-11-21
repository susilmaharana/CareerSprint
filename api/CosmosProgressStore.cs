using System.Net;
using Microsoft.Azure.Cosmos;

namespace CareerSprint.Api;

/// <summary>Cosmos DB implementation of the per-authenticated-user progress store.</summary>
public sealed class CosmosProgressStore : IProgressStore
{
    private static readonly Lazy<CosmosClient> Client = new(() =>
        new CosmosClient(Environment.GetEnvironmentVariable("COSMOS_CONNECTION_STRING")
            ?? throw new InvalidOperationException("Missing COSMOS_CONNECTION_STRING")));

    private readonly Container container;

    public CosmosProgressStore()
    {
        container = Client.Value.GetContainer(
            Environment.GetEnvironmentVariable("COSMOS_DATABASE") ?? "careersprint",
            Environment.GetEnvironmentVariable("COSMOS_CONTAINER") ?? "progress");
    }

    public CosmosProgressStore(Container container) => this.container = container;

    public async Task<StoredProgress?> ReadAsync(string userDocumentId)
    {
        try
        {
            var response = await container.ReadItemAsync<ProgressDocument>(userDocumentId, new PartitionKey(userDocumentId));
            return new StoredProgress(response.Resource, response.ETag);
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<string> CreateAsync(ProgressDocument document)
    {
        try
        {
            var response = await container.CreateItemAsync(document, new PartitionKey(document.Id));
            return response.ETag;
        }
        catch (CosmosException ex) when (IsConflict(ex))
        {
            throw new ProgressConflictException();
        }
    }

    public async Task<string> ReplaceAsync(ProgressDocument document, string etag)
    {
        try
        {
            var response = await container.ReplaceItemAsync(document, document.Id, new PartitionKey(document.Id),
                new ItemRequestOptions { IfMatchEtag = etag });
            return response.ETag;
        }
        catch (CosmosException ex) when (IsConflict(ex))
        {
            throw new ProgressConflictException();
        }
    }

    private static bool IsConflict(CosmosException exception) =>
        exception.StatusCode is HttpStatusCode.Conflict or HttpStatusCode.PreconditionFailed or HttpStatusCode.NotFound;
}
