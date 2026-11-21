using CareerSprint.Api;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices(services =>
    {
        services.AddSingleton<IProgressStore>(_ => new CosmosProgressStore());
        services.AddTransient<ProgressApi>();
    })
    .Build();

host.Run();
