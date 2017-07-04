package org.sonarqube.tests.qualityProfile;

import com.sonar.orchestrator.Orchestrator;
import java.io.File;
import java.util.concurrent.TimeUnit;
import org.junit.ClassRule;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.DisableOnDebug;
import org.junit.rules.TestRule;
import org.junit.rules.Timeout;
import org.sonarqube.tests.Tester;
import org.sonarqube.ws.Organizations;
import org.sonarqube.ws.QualityProfiles;
import org.sonarqube.ws.client.rule.SearchWsRequest;
import util.ItUtils;

import static java.lang.String.format;
import static org.assertj.core.api.Assertions.assertThat;

public class ActiveRuleEsResilienceTest {
  private static final String RULE_ONE_BUG_PER_LINE = "xoo:OneBugIssuePerLine";

  @ClassRule
  public static final Orchestrator orchestrator = Orchestrator.builderEnv()
    .setServerProperty("sonar.web.javaAdditionalOpts",
      format("-javaagent:%s=script:%s,boot:%s", findBytemanJar(), findBytemanScript(), findBytemanJar()))
    .setServerProperty("sonar.search.recovery.delayInMs", "1000")
    .setServerProperty("sonar.search.recovery.minAgeInMs", "3000")
    .addPlugin(ItUtils.xooPlugin())
    .build();

  @Rule
  public TestRule timeout = new DisableOnDebug(Timeout.builder()
    .withLookingForStuckThread(true)
    .withTimeout(60L, TimeUnit.SECONDS)
    .build());

  @Rule
  public Tester tester = new Tester(orchestrator);

  @Test
  public void activation_of_rule_is_resilient_to_indexing_errors() throws Exception {
    Organizations.Organization organization = tester.organizations().generate();
    QualityProfiles.CreateWsResponse.QualityProfile profile = tester.qProfiles().createXooProfile(organization);

    tester.qProfiles().activateRule(profile.getKey(), RULE_ONE_BUG_PER_LINE);

    assertThat(searchActiveRules(profile)).isEqualTo(0);
    while (searchActiveRules(profile) != 0) {
      // rule is indexed by the recovery daemon, which runs every 5 seconds
      Thread.sleep(1_000L);
    }
  }

  private long searchActiveRules(QualityProfiles.CreateWsResponse.QualityProfile profile) {
    SearchWsRequest request = new SearchWsRequest().setActivation(true).setQProfile(profile.getKey());
    return tester.wsClient().rules().search(request).getTotal();
  }

  private static String findBytemanJar() {
    // see pom.xml, Maven copies and renames the artifact.
    File jar = new File("target/byteman.jar");
    if (!jar.exists()) {
      throw new IllegalStateException("Can't find " + jar + ". Please execute 'mvn generate-test-resources' on integration tests once.");
    }
    return jar.getAbsolutePath();
  }

  private static String findBytemanScript() {
    // see pom.xml, Maven copies and renames the artifact.
    File script = new File("resilience/active_rule_indexer.btm");
    if (!script.exists()) {
      throw new IllegalStateException("Can't find " + script);
    }
    return script.getAbsolutePath();
  }
}
