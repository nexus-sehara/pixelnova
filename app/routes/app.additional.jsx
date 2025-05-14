import { TitleBar } from "@shopify/app-bridge-react";
import { ExampleSetupGuide } from "../components/ExampleSetupGuide";

export default function AdditionalPage() {
  return (
    <>
      <TitleBar title="Additional Features" />
      <div style={{ margin: '2rem auto', maxWidth: '60rem' }}>
        <ExampleSetupGuide />
      </div>
    </>
  );
}
