// Basic SetupGuide component for demonstration
import { Card, Button, Stack, TextContainer, Thumbnail } from "@shopify/polaris";

export function SetupGuide({ onDismiss, onStepComplete, items }) {
  return (
    <Card sectioned>
      <Stack vertical spacing="loose">
        <Stack distribution="equalSpacing">
          <h2>Setup Guide</h2>
          <Button onClick={onDismiss} plain>Dismiss</Button>
        </Stack>
        <Stack vertical spacing="loose">
          {items.map((item) => (
            <Card key={item.id} sectioned>
              <Stack alignment="center">
                {item.image?.url && (
                  <Thumbnail
                    source={item.image.url}
                    alt={item.image.alt || item.title}
                  />
                )}
                <Stack vertical>
                  <TextContainer>
                    <strong>{item.title}</strong>
                    <div>{item.description}</div>
                  </TextContainer>
                  <Stack>
                    {item.primaryButton && (
                      <Button {...item.primaryButton.props}>
                        {item.primaryButton.content}
                      </Button>
                    )}
                    {item.secondaryButton && (
                      <Button {...item.secondaryButton.props}>
                        {item.secondaryButton.content}
                      </Button>
                    )}
                    <Button
                      onClick={() => onStepComplete(item.id)}
                      tone={item.complete ? "success" : "primary"}
                    >
                      {item.complete ? "Completed" : "Mark Complete"}
                    </Button>
                  </Stack>
                </Stack>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}
