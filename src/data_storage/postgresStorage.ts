import * as t from "io-ts";
import Result, {ErrorNotFound} from "../result";
import {pipe} from "fp-ts/lib/pipeable";
import {fold} from "fp-ts/lib/Either";
import {Errors} from "io-ts";
import {failure} from "io-ts/lib/PathReporter";
import {PoolClient, QueryConfig, QueryResult} from "pg";
import uuid from "uuid"
import PostgresAdapter from "./adapters/postgres/postgres";
import Logger from "../logger"

// PostgresStorage contains ORM like CRUD functions, and a few helpers for more complex functionality.
// This contains things like transaction runners, as well as things like the type decoder
// and simple row/query functions. This is intended to be extended only - never used alone
export default abstract class PostgresStorage {
    // Decode and Validate attempts to decode the input into the type requested by the user. If successful, a user
    // supplied function will run (usually calling whatever storage operation they originally wanted). On failure a
    // formatted error result will be returned instead.
    decodeAndValidate<T>(x: t.Type<any>, onSuccess:(r: (r:any) => void) => (x:T) => void, input:any[] ): Promise<Result<T>> {
        return new Promise((resolve) => {
            pipe(x.decode(input), fold(this.OnDecodeError(resolve), onSuccess(resolve)))
        })
    }

    private async startTransaction(): Promise<Result<PoolClient>> {
        const client = await PostgresAdapter.Instance.Pool.connect();

        return new Promise(resolve => {
            if (!client) {
                resolve(Result.Failure("unable to secure Postgres client from Pool"));
                return
            }

            client.query('BEGIN')
                .then(() => resolve(Result.Success(client)))
                .catch((e) => {
                    resolve(Result.Failure(e))
                })

        })
    }

    // generally you'll use transactions for create/update/destroy functionality
    // as such, you'll be in charge of your own return and input values.
    async runAsTransaction(...statements:QueryConfig[]): Promise<Result<boolean>> {
        const client = await this.startTransaction();
        const i = 0;

        try {
           for(const j in statements) {
               await client.value.query(statements[j])
           }

           await client.value.query('COMMIT')
        }
        catch(e) {
           await client.value.query('ROLLBACK');
           client.value.release();
           return new Promise(resolve => {
               Logger.error(`INSERT transaction failed - ${(e as Error).message} for values ${statements[i].values}`);
               resolve(Result.Failure(`${(e as Error).message} for values ${statements[i].values} `))
           })
        }

        return new Promise((resolve) => {
            client.value.release();
            resolve(Result.Success(true))
        })
    }

    // run simple query
    async run(statement:QueryConfig): Promise<Result<boolean>> {
        return new Promise(resolve => {
            PostgresAdapter.Instance.Pool.query(statement)
                .then(() => {
                    resolve(Result.Success(true))
                })
                .catch(e => {
                    Logger.error(`query failed - ${(e as Error).message}`);
                    resolve(Result.Failure(e))
                })
        })
    }

    // run a query, retrieve first result and cast to T
    retrieve<T>(q: QueryConfig): Promise<Result<T>> {
        return new Promise<Result<any>>(resolve => {
            PostgresAdapter.Instance.Pool.query<T>(q)
                .then(res => {
                    if(res.rows.length < 1) resolve(Result.Error(ErrorNotFound));

                    resolve(Result.Success(res.rows[0]))
                })
                .catch(e => {
                    resolve(Result.Failure(`record retrieval failed - ${(e as Error).message}`))
                })
        })
    }

    // run query and return all rows, cast to T
    rows<T>(q:QueryConfig): Promise<Result<T[]>> {
        return new Promise<Result<any[]>>(resolve => {
            PostgresAdapter.Instance.Pool.query<T>(q)
                .then(res => {
                    resolve(Result.Success(res.rows))
                })
                .catch(e => {
                    resolve(Result.Failure(`row retrieval failed - ${(e as Error).message}`))
                })
        })
    }

    // count accepts SELECT COUNT(*) queries only
    count(q:QueryConfig): Promise<Result<number>> {
        return new Promise<Result<number>>(resolve => {
            if(!q.text.includes("SELECT COUNT")) resolve(Result.Failure('query must be a SELECT COUNT(*) query'))

            PostgresAdapter.Instance.Pool.query(q)
                .then(res => {
                    resolve(Result.Success(parseInt(res.rows[0].count, 10)))
                })
                .catch(e => {
                    resolve(Result.Failure(`row retrieval failed - ${(e as Error).message}`))
                })
        })
    }

    OnDecodeError(resolve:((check: any) => void) ): ((e: Errors ) => void) {
        return ((e) => {
            resolve(Result.Failure(`${failure(e)}`))
        })
    }

    // chose to wrap this vs. call the library in a child class
    generateUUID(): string {
        return uuid.v4()
    }
}
