/* tslint:disable */
import faker from 'faker'
import { expect } from 'chai'
import PostgresAdapter from "../../data_storage/adapters/postgres/postgres";
import Logger from "../../logger";
import ContainerStorage from "../../data_storage/container_storage";
import DataSourceStorage from "../../data_storage/import/data_source_storage";
import ImportStorage from "../../data_storage/import/import_storage";

describe('An Import Adapter Import', async() => {
    var containerID:string = process.env.TEST_CONTAINER_ID || "";

    before(async function() {
       if (process.env.CORE_DB_CONNECTION_STRING === "") {
           Logger.debug("skipping export tests, no storage layer");
           this.skip()
       }

        let storage = ContainerStorage.Instance;

        await PostgresAdapter.Instance.init();
        let container = await storage.Create("test suite", {"name": faker.name.findName(), "description": faker.random.alphaNumeric()});

        expect(container.isError).false;
        expect(container.value).not.empty;
        containerID = container.value[0].id!;

        return Promise.resolve()
    });

    it('can be initiated and unpacked', async()=> {
        let storage = DataSourceStorage.Instance;
        let logStorage = ImportStorage.Instance;

        let exp = await storage.Create(containerID, "test suite",
            {
                name: "Test Data Source",
                active:false,
                adapter_type:"http",
                config: {}});

        expect(exp.isError).false;
        expect(exp.value).not.empty;

        let log = await logStorage.InitiateJSONImportAndUnpack(exp.value.id!, "test suite", "test", payload);
        expect(log.isError).false;

        return storage.PermanentlyDelete(exp.value.id!)
    });

    it('can be initiated, appended to, and unpacked', async()=> {
        let storage = DataSourceStorage.Instance;
        let logStorage = ImportStorage.Instance;

        let exp = await storage.Create(containerID, "test suite",
            {
                name: "Test Data Source",
                active:false,
                adapter_type:"http",
                config: {}});

        expect(exp.isError).false;
        expect(exp.value).not.empty;

        let log = await logStorage.InitiateJSONImport(exp.value.id!, "test suite", "test", payload);
        expect(log.isError).false;


        let logs = await logStorage.ListUncompleted(exp.value.id!, 0, 100);
        expect(logs.isError).false;
        expect(logs.value).not.empty;

        for(const l of logs.value) {
           let appended = await logStorage.AppendToJSONImport(l.id, [{"appended": "appended"}])
            expect(appended.isError).false
        }

        return storage.PermanentlyDelete(exp.value.id!)
    });

    it('can be listed', async()=> {
        let storage = DataSourceStorage.Instance;
        let logStorage = ImportStorage.Instance;

        let exp = await storage.Create(containerID, "test suite",
            {
                name: "Test Data Source",
                active:false,
                adapter_type:"http",
                config: {}});

        expect(exp.isError).false;
        expect(exp.value).not.empty;

        let log = await logStorage.InitiateJSONImportAndUnpack(exp.value.id!, "test suite", "test", payload);
        expect(log.isError).false;

        let logs = await logStorage.List(exp.value.id!, 0, 100);
        expect(logs.isError).false;
        expect(logs.value).not.empty;

        return storage.PermanentlyDelete(exp.value.id!)
    });

    it('can be stopped', async()=> {
        let storage = DataSourceStorage.Instance;
        let logStorage = ImportStorage.Instance;

        let exp = await storage.Create(containerID, "test suite",
            {
                name: "Test Data Source",
                active:false,
                adapter_type:"http",
                config: {}});

        expect(exp.isError).false;
        expect(exp.value).not.empty;

        let log = await logStorage.InitiateJSONImportAndUnpack(exp.value.id!, "test suite", "test", payload);
        expect(log.isError).false;

        let logs = await logStorage.ListUncompleted(exp.value.id!, 0, 100);
        expect(logs.isError).false;
        expect(logs.value).not.empty;

        for(const l of logs.value) {
            let stopped = await logStorage.SetStopped(l.id);
            expect(stopped.isError).false;

            let check = await logStorage.Retrieve(l.id);
            expect(check.isError).false;
            expect(check.value.stopped_at).not.null
        }

        return storage.PermanentlyDelete(exp.value.id!)
    });

    it('can be updated with errors', async()=> {
        let storage = DataSourceStorage.Instance;
        let logStorage = ImportStorage.Instance;

        let exp = await storage.Create(containerID, "test suite",
            {
                name: "Test Data Source",
                active:false,
                adapter_type:"http",
                config: {}});

        expect(exp.isError).false;
        expect(exp.value).not.empty;

        let log = await logStorage.InitiateJSONImportAndUnpack(exp.value.id!, "test suite", "test", payload);
        expect(log.isError).false;

        let logs = await logStorage.ListUncompleted(exp.value.id!, 0, 100);
        expect(logs.isError).false;
        expect(logs.value).not.empty;

        for(const l of logs.value) {
            let stopped = await logStorage.SetErrors(l.id, ["test error"]);
            expect(stopped.isError).false;

            let check = await logStorage.Retrieve(l.id);
            expect(check.isError).false;
            expect(check.value.errors!).not.empty
        }

        return storage.PermanentlyDelete(exp.value.id!)
    });

    it('can be retrieved by last stopped', async()=> {
        let storage = DataSourceStorage.Instance;
        let logStorage = ImportStorage.Instance;

        let exp = await storage.Create(containerID, "test suite",
            {
                name: "Test Data Source",
                active:false,
                adapter_type:"http",
                config: {}});

        expect(exp.isError).false;
        expect(exp.value).not.empty;

        let log = await logStorage.InitiateJSONImportAndUnpack(exp.value.id!, "test suite", "test", payload);
        expect(log.isError).false;

        let logs = await logStorage.ListUncompleted(exp.value.id!, 0, 100);
        expect(logs.isError).false;
        expect(logs.value).not.empty;

        for(const l of logs.value) {
            let stopped = await logStorage.SetStopped(l.id);
            expect(stopped.isError).false;

            let check = await logStorage.Retrieve(l.id);
            expect(check.isError).false;
            expect(check.value.stopped_at).not.null
        }

        let stopped = await logStorage.RetrieveLast(exp.value.id!);
        expect(stopped.isError).false;

        return storage.PermanentlyDelete(exp.value.id!)
    });
});

const payload = [{
    test: "test"
}]

