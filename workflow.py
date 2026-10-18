"""OmniShip delivery pipeline for the Octacity Leaderboard.

OmniShip has no scheduled trigger, so `.github/workflows/refresh.yml` (hand-written)
collects fresh data on a cron and publishes it on the `data` branch, which the site
reads at runtime. Ship below only deploys code changes.
"""

from omniship import Pipeline
from omniship.plugins.bun import Bun, BunBuild, BunToolchain
from omniship.plugins.github import (
    GitHubActions,
    GitHubPages,
    GitHubPullRequest,
    GitHubPush,
    GitHubWorkflow,
    GitHubWorkflowDispatch,
)

github = GitHubActions(
    # Pushes to main already run Check through Ship -> Build -> Check.
    check=GitHubWorkflow(file="check.yml", name="Check", triggers=(GitHubPullRequest(),)),
    ship=GitHubWorkflow(
        file="ship.yml",
        name="Ship",
        triggers=(GitHubPush(branches=("main",)), GitHubWorkflowDispatch()),
    ),
)
pipeline = Pipeline(targets=[github])
bun = BunToolchain(version="1.4.2")


@pipeline.check
def check(stage):
    @stage.task(requires=[bun])
    def validate_site(ctx):
        runner = Bun(ctx)
        runner.install()
        runner.build(script="typecheck")
        runner.test()
        runner.build()


@pipeline.build
def build(stage):
    stage.task(
        BunBuild(artifacts=("dist",)),
        requires=[bun],
    )


@pipeline.ship
def ship(stage):
    stage.task(GitHubPages(artifact="dist"))
