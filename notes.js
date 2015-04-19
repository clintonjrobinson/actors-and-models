//GCC - galactic central command

Person.get(context, 1234, {
  lock: true, //locks doc, noone else allowed to edit until its released
  forEdit: true, //lets GCC know
  observe: true //hooks up websockets to watch for updates on this thing.
});

Person.view(); //views an instance of the model
Person.edit(); //retrieves for an edit, puts the model in edit mode
Person.release(); //Sends er back.  We are releasing the edit lock

var Actor; // Describes an Actor who acts on the system. AKA a User.

var Type; //Describes a special kind of Data Type. (ie an Image)
// includes blueprints on how API's can be generated when combined with Models

var Structure; //A schema that defines instances of datum, must be combined with a Model to be persisted
// includes security
// includes validation
// includes property definitions

var Model; //A schema that defines instances of datum that are persisted
// includes security
// includes validation
// includes property definitions
// creates an API

var Projection; //A schema that defines a read-only view of one or more Models based on input parameters
// includes security
// creates an API

var Aggregate; //Defines data that is created from aggregation of instances Models.
// includes security
// creates an API

var Channel; //A definition of a stream of non-persisted, temporal data
// includes security
// creates an API

var Worker; //A thread that listens to Channels and does some work.

//subdocument
//new - the whole subdoc is new
//patch - patching specific parts of it

//array of primitives
//new - whole array is new
//add - we are adding something into the array, but what position?
//pull - we are pulling something from an array, doesn't matter what position
//move - entry moved position in the array.  could be pull + add

//array of subdocuments
//new - the whole array is new
//add - we are adding something new into the array,
//patch - we are patching one entry.
//pull - we are removing or more entries
//move - entry moved position in the array.  could be pull + add

var editLock = {
  owner: ObjectID,
  expires: Date.now() + 5000
};


//What do Actors do 90% of the time

//search for models
//view parts of many instances at once
//view entire specific instance of a model
//edit specific instance of a model

//What would a server do
//pretty much anything

//Do we need a patch?
//pros
//efficient on data transfer
//eliminates over-writes in collab envs
//opens path to allow streaming in collab envs
//allows smarter validation

//cons
//hard to implement
//many scenarios where it may break
