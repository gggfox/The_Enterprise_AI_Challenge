// STUB -- replaced by `npx convex dev` codegen. See README.md.
import type {
  AnyDataModel,
  DataModelFromSchemaDefinition,
  DocumentByName,
  GenericId,
  TableNamesInDataModel,
} from 'convex/server'
import type schema from '../schema'

export type DataModel = DataModelFromSchemaDefinition<typeof schema>
export type TableNames = TableNamesInDataModel<DataModel>
export type Doc<T extends TableNames> = DocumentByName<DataModel, T>
export type Id<T extends TableNames> = GenericId<T>
export type _DataModel = AnyDataModel
