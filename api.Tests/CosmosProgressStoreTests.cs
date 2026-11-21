using CareerSprint.Api;
using Microsoft.Azure.Cosmos;
using Moq;
using Xunit;

namespace CareerSprint.Api.Tests;

public sealed class CosmosProgressStoreTests
{
    [Fact]
    public async Task ReadAsync_UsesAuthenticatedDocumentIdAsItemAndPartitionKey()
    {
        const string userId = "user-alice";
        const string etag = "\"cosmos-v1\"";
        var document = new ProgressDocument { Id = userId };
        var itemResponse = new Mock<ItemResponse<ProgressDocument>>();
        itemResponse.SetupGet(response => response.Resource).Returns(document);
        itemResponse.SetupGet(response => response.ETag).Returns(etag);
        var container = new Mock<Container>();
        container.Setup(client => client.ReadItemAsync<ProgressDocument>(userId, It.IsAny<PartitionKey>(),
                It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(itemResponse.Object);
        var store = new CosmosProgressStore(container.Object);

        var result = await store.ReadAsync(userId);

        Assert.NotNull(result);
        Assert.Same(document, result.Document);
        Assert.Equal(etag, result.ETag);
        container.Verify(client => client.ReadItemAsync<ProgressDocument>(userId,
            It.Is<PartitionKey>(key => key.Equals(new PartitionKey(userId))), It.IsAny<ItemRequestOptions>(),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CreateAsync_UsesUserPartitionAndReturnsCosmosEtag()
    {
        var document = new ProgressDocument { Id = "user-alice" };
        const string etag = "\"cosmos-v1\"";
        var itemResponse = new Mock<ItemResponse<ProgressDocument>>();
        itemResponse.SetupGet(response => response.ETag).Returns(etag);
        var container = new Mock<Container>();
        container.Setup(client => client.CreateItemAsync(document, It.IsAny<PartitionKey?>(),
                It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(itemResponse.Object);
        var store = new CosmosProgressStore(container.Object);

        var result = await store.CreateAsync(document);

        Assert.Equal(etag, result);
        container.Verify(client => client.CreateItemAsync(document,
            It.Is<PartitionKey?>(key => key.HasValue && key.Value.Equals(new PartitionKey(document.Id))),
            It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ReplaceAsync_PassesIfMatchEtagToCosmos()
    {
        var document = new ProgressDocument { Id = "user-alice" };
        const string priorEtag = "\"cosmos-v1\"";
        const string nextEtag = "\"cosmos-v2\"";
        var itemResponse = new Mock<ItemResponse<ProgressDocument>>();
        itemResponse.SetupGet(response => response.ETag).Returns(nextEtag);
        var container = new Mock<Container>();
        container.Setup(client => client.ReplaceItemAsync(document, document.Id, It.IsAny<PartitionKey?>(),
                It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(itemResponse.Object);
        var store = new CosmosProgressStore(container.Object);

        var result = await store.ReplaceAsync(document, priorEtag);

        Assert.Equal(nextEtag, result);
        container.Verify(client => client.ReplaceItemAsync(document, document.Id,
            It.Is<PartitionKey?>(key => key.HasValue && key.Value.Equals(new PartitionKey(document.Id))),
            It.Is<ItemRequestOptions>(options => options.IfMatchEtag == priorEtag), It.IsAny<CancellationToken>()), Times.Once);
    }
}
