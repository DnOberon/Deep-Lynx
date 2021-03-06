import Result from "../../result"
import PostgresStorage from "../postgresStorage";
import {QueryConfig} from "pg";
import * as t from "io-ts";
import {NodesT, NodeT, nodeT, nodesT} from "../../types/graph/nodeT";
import MetatypeKeyStorage from "../metatype_key_storage";
import {CompileMetatypeKeys, MetatypeKeyT} from "../../types/metatype_keyT";
import {pipe} from "fp-ts/lib/pipeable";
import {fold} from "fp-ts/lib/Either";
import MetatypeStorage from "../metatype_storage";

/*
* NodeStorage encompasses all logic dealing with the manipulation of the data nodes
* class in a data storage layer.
*/
export default class NodeStorage extends PostgresStorage{
    public static tableName = "nodes";

    private static instance: NodeStorage;

    public static get Instance(): NodeStorage {
        if(!NodeStorage.instance) {
            NodeStorage.instance = new NodeStorage()
        }

        return NodeStorage.instance
    }

    /*
    Create accepts an unknown amount of payload. Payload must be a single
    or array of "Node" types or objects that conform to that type. Once validated
    the node record's properties are validated. If all validations succeed the
    node is inserted into the database and returned with its value.

    Whenever possible, pass in both the original_data_id and the data_source_id.
    This allows other operations, such as the edge connections, to be able to search
    by original id and separation between data sources.

    This will attempt to create a node if one doesn't exist, or update the node if
    passed an updated node.
    */
    public async CreateOrUpdate(containerID: string, graphID: string, input: any | NodesT, preQueries?: QueryConfig[], postQueries?: QueryConfig[]): Promise<Result<NodesT>> {
        const onValidateSuccess = ( resolve: (r:any) => void): (n: NodesT)=> void => {
            return async(ns: NodesT) => {
                const queries: QueryConfig[] = [];
                if(preQueries) queries.push(...preQueries);

                // validate each node's properties for declared type. We don't
                // have to check metatype id because they would not have gotten
                // here without one present, and validate properties will fail
                // if no metatype is found
                const keysByMetatypeID: {[key:string]: any} = [];

                for(const n in ns) {
                    // find and register metatype keys
                    if(!keysByMetatypeID[ns[n].metatype_id]) {
                        const m = await MetatypeStorage.Instance.Retrieve(ns[n].metatype_id);
                        if(m.isError || m.value.container_id !== containerID) {
                            resolve(Result.Failure(`unable to find metatype, or metatype does not belong to container`));
                            return
                        }

                        const typeKeys = await MetatypeKeyStorage.Instance.List(m.value.id!);
                        if(typeKeys.isError || typeKeys.value.length <= 0) {
                            resolve(Result.Failure(typeKeys.error?.error!));
                            return
                        }

                        keysByMetatypeID[ns[n].metatype_id] = typeKeys.value
                    }

                    const valid = await this.validateNodeProperties((keysByMetatypeID[ns[n].metatype_id]), ns[n].properties);
                    if(valid.isError || !valid.value) {
                        resolve(Result.Failure(`node's properties do no match declared metatype: ${ns[n].metatype_id}`));
                        return
                    }

                    ns[n].graph_id = graphID;
                    ns[n].container_id = containerID;


                    // the only way we can tell if we should update this or not is through the modified_at tag. Is there
                    // a better way to handle this? Probably. However, in the large scheme of the Type Mapping system
                    // this was the easiest way to accomplish this goal
                    if((ns[n].modified_at || ns[n].deleted_at) && ns[n].id) queries.push(...NodeStorage.fullUpdateStatement(ns[n]))
                    else if((ns[n].modified_at || ns[n].deleted_at) && !ns[n].id && ns[n].original_data_id && ns[n].data_source_id) queries.push(...NodeStorage.fullUpdateByOriginalIDStatement(ns[n]))
                    else {

                        ns[n].id = super.generateUUID();
                        queries.push(...NodeStorage.createStatement(ns[n]))
                    }

                }

                if(postQueries) queries.push(...postQueries);

                super.runAsTransaction(...queries)
                    .then((r) => {
                        if(r.isError) {
                            resolve(r);
                            return
                        }

                        resolve(Result.Success(ns))
                    })
            }
        };

        const payload = (t.array(t.unknown).is(input)) ? input : [input];

        return super.decodeAndValidate<NodesT>(nodesT, onValidateSuccess, payload)
   }

    public async CreateOrUpdateStatement(containerID: string, graphID: string, ns: NodesT, preQueries?: QueryConfig[], postQueries?: QueryConfig[]): Promise<Result<QueryConfig[]>> {
                const queries: QueryConfig[] = [];
                if(preQueries) queries.push(...preQueries);

                // validate each node's properties for declared type. We don't
                // have to check metatype id because they would not have gotten
                // here without one present, and validate properties will fail
                // if no metatype is found
                const keysByMetatypeID: {[key:string]: any} = [];

                for(const n in ns) {
                    // find and register metatype keys
                    if(!keysByMetatypeID[ns[n].metatype_id]) {
                        const m = await MetatypeStorage.Instance.Retrieve(ns[n].metatype_id);
                        if(m.isError || m.value.container_id !== containerID) {
                            return new Promise(resolve => resolve(Result.Failure(`unable to find metatype, or metatype does not belong to container`)));
                        }

                        const typeKeys = await MetatypeKeyStorage.Instance.List(m.value.id!);
                        if(typeKeys.isError || typeKeys.value.length <= 0) {
                            return new Promise(resolve => resolve(Result.Failure(typeKeys.error?.error!)));
                        }

                        keysByMetatypeID[ns[n].metatype_id] = typeKeys.value
                    }

                    const valid = await this.validateNodeProperties((keysByMetatypeID[ns[n].metatype_id]), ns[n].properties);
                    if(valid.isError || !valid.value) {
                        return new Promise(resolve => resolve(Result.Failure(`node's properties do no match declared metatype: ${ns[n].metatype_id}`)));
                    }

                    ns[n].graph_id = graphID;
                    ns[n].container_id = containerID;


                    // the only way we can tell if we should update this or not is through the modified_at tag. Is there
                    // a better way to handle this? Probably. However, in the large scheme of the Type Mapping system
                    // this was the easiest way to accomplish this goal
                    if((ns[n].modified_at || ns[n].deleted_at) && ns[n].id) queries.push(...NodeStorage.fullUpdateStatement(ns[n]))
                    else if((ns[n].modified_at || ns[n].deleted_at) && !ns[n].id && ns[n].original_data_id && ns[n].data_source_id) queries.push(...NodeStorage.fullUpdateByOriginalIDStatement(ns[n]))
                    else {

                        ns[n].id = super.generateUUID();
                        queries.push(...NodeStorage.createStatement(ns[n]))
                    }

                }

                if(postQueries) queries.push(...postQueries);

                return new Promise(resolve => resolve(Result.Success(queries)))
    }

    public PermanentlyDelete(id: string): Promise<Result<boolean>> {
        return super.run(NodeStorage.deleteStatement(id))
    }

    public Archive(id: string): Promise<Result<boolean>> {
        return super.run(NodeStorage.archiveStatement(id))
    }

    private async validateNodeProperties(typeKeys: MetatypeKeyT[], input:any): Promise<Result<boolean>> {
        // easiest way to create type for callback func
        const compiledType = CompileMetatypeKeys(typeKeys);

        // allows us to accept an array of input if needed
        const payload = (t.array(t.unknown).is(input)) ? input : [input];

        const onValidateSuccess = ( resolve: (r:any) => void): (c: any)=> void => {
            return async (cts:any) => {
               resolve(Result.Success(true))
            }
        };

        return new Promise((resolve) => {
            pipe(t.array(compiledType).decode(payload), fold(this.OnDecodeError(resolve), onValidateSuccess(resolve)))
        })
    }

    public Retrieve(id: string): Promise<Result<NodeT>> {
        return super.retrieve<NodeT>(NodeStorage.retrieveStatement(id))
    }

    public RetrieveByOriginalID(originalID: string, dataSourceID: string): Promise<Result<NodeT>> {
        return super.retrieve<NodeT>(NodeStorage.retrieveByOriginalIDStatement(dataSourceID, originalID))
    }


    // Below are a set of query building functions. So far they're very simple
    // and the return value is something that the postgres-node driver can understand
    // My hope is that this method will allow us to be flexible and create more complicated
    // queries more easily.
    private static createStatement(n: NodeT): QueryConfig[] {
        return [
            {
            text:`INSERT INTO nodes(id, container_id, metatype_id, graph_id, properties,original_data_id,data_source_id,data_type_mapping_id) VALUES($1, $2, $3, $4, $5, $6, $7,$8)
ON CONFLICT (original_data_id, data_source_id)
DO
UPDATE  SET container_id = $2, metatype_id = $3, graph_id = $4, properties = $5, original_data_id = $6, data_source_id = $7, data_type_mapping_id = $8, modified_at = NOW()`,
            values: [n.id, n.container_id, n.metatype_id,n.graph_id, n.properties,n.original_data_id, n.data_source_id, n.data_type_mapping_id]
             }

        ]
    }

    private static retrieveStatement(nodeID: string): QueryConfig {
        return {
            text: `SELECT * FROM nodes WHERE id = $1 AND NOT archived`,
            values: [nodeID]
        }
    }

    // because the data source and data are so tightly intertwined, you must include both in order to pull a single
    // piece of data by original id
    private static retrieveByOriginalIDStatement(dataSourceID:string, originalID: string): QueryConfig {
        return {
            text: `SELECT * FROM nodes WHERE original_data_id = $1 AND data_source_id = $2 AND NOT archived`,
            values: [originalID, dataSourceID]
        }
    }

    private static fullUpdateStatement(n: NodeT): QueryConfig[] {
        return [{
            text: `UPDATE nodes SET container_id = $1, graph_id = $2, properties = $3, original_data_id = $4, data_source_id = $5, data_type_mapping_id = $6, modified_at = $7, deleted_at = $8 WHERE id = $9`,
            values: [n.container_id, n.graph_id, n.properties,n.original_data_id, n.data_source_id, n.data_type_mapping_id, n.modified_at,n.deleted_at, n.id]
        }]
    }

    private static fullUpdateByOriginalIDStatement(n: NodeT): QueryConfig[] {
        return [{
            text: `UPDATE nodes SET container_id = $1, graph_id = $2, properties = $3, original_data_id = $4, data_source_id = $5, data_type_mapping_id = $6, modified_at = $7, deleted_at = $8 WHERE original_data_id = $9 AND data_source_id = $10`,
            values: [n.container_id, n.graph_id, n.properties,n.original_data_id, n.data_source_id, n.data_type_mapping_id, n.modified_at,n.deleted_at, n.original_data_id, n.data_source_id]
        }]
    }

    private static archiveStatement(nodeID: string): QueryConfig {
        return {
            text:`UPDATE nodes SET archived = true  WHERE id = $1`,
            values: [nodeID]
        }
    }

    private static deleteStatement(nodeID: string): QueryConfig {
        return {
            text:`DELETE FROM nodes WHERE id = $1`,
            values: [nodeID]
        }
    }
}
