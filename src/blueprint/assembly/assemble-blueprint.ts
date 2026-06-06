import type {
  BlueprintMeta,
  DomainModel,
  FlowModel,
  GenerationPolicy,
  InputUnderstanding,
  ProductBlueprintV1,
  ProductIntent,
  UIModel,
  UncertaintyModel,
  UserModel,
  VisualPolicy
} from "../types/blueprint.js";

export function assembleBlueprint(input: {
  meta: BlueprintMeta;
  understanding: InputUnderstanding;
  product: ProductIntent;
  users: UserModel;
  domain: DomainModel;
  flows: FlowModel;
  ui: UIModel;
  visualPolicy: VisualPolicy;
  generationPolicy: GenerationPolicy;
  uncertainty: UncertaintyModel;
}): ProductBlueprintV1 {
  return {
    meta: input.meta,
    input: input.understanding,
    product: input.product,
    users: input.users,
    domain: input.domain,
    flows: input.flows,
    ui: input.ui,
    visualPolicy: input.visualPolicy,
    generationPolicy: input.generationPolicy,
    uncertainty: input.uncertainty
  };
}
