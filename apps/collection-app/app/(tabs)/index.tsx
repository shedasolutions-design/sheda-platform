import { View } from "react-native";
import { router } from "expo-router";
import ProjectCard from "@/components/ProjectCard";
import { FinePrint, PageTitle, Screen, Section } from "@/components/ui";
import { SAMPLE_PROJECTS } from "@/services/projects";

/**
 * Raises open for investment.
 *
 * Opens on real content rather than a prompt to connect a wallet. Someone
 * deciding whether this is worth their money has not decided to sign
 * anything yet, and asking them to first is how a browse screen stops being
 * browsed.
 */
export default function Invest() {
  return (
    <Screen>
      <PageTitle
        title="Back a building"
        subtitle="Put money into a development before it is built, and earn a share of the rent once it is let."
      />

      <Section title="Open raises">
        <View style={{ gap: 14 }}>
          {SAMPLE_PROJECTS.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onPress={() => router.push(`/project/${p.id}`)}
            />
          ))}
        </View>
      </Section>

      <FinePrint>
        Returns shown are each builder&apos;s own estimate. Sheda does not verify them and does not
        guarantee any return.
      </FinePrint>
    </Screen>
  );
}
